// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { MarketingPublisherService, PublishDueTargetsOptions } from "../interfaces/marketing-publisher.service";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import { FacebookPublisherError } from "../../ports/facebook-publisher.port";
import {
  type SocialPublicationReceipt,
  type SocialPublisherPort,
  SocialPublisherError,
} from "../../ports/social-publisher.port";
import type { SocialPublisherRegistry } from "./social-publisher-registry";
import type {
  MarketingCampaignState,
  PublicationAttempt,
  PublicationRecord,
  PublicationTarget,
  PublicationTargetStatus,
} from "../../../domain/entities/marketing-campaign";
import {
  calculatePublicationTargetDigest,
  deriveAggregatePublicationStatus,
} from "../../../domain/services/marketing-publication-policy";
import { MarketingApplicationError } from "../../../presentation/middleware/marketing-error.middleware";
import type { PublishPackageRequest } from "../interfaces/marketing-publisher.service";

export interface MarketingPublisherServiceOptions {
  readonly marketingRepository: MarketingRepository;
  readonly publisherRegistry: SocialPublisherRegistry;
  readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  readonly now?: () => string;
  readonly generateId?: () => string;
  readonly defaultWorkerId?: string;
  readonly leaseSeconds?: number;
}

export class MarketingPublisherServiceImpl implements MarketingPublisherService {
  private readonly marketingRepository: MarketingRepository;
  private readonly publisherRegistry: SocialPublisherRegistry;
  private readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  private readonly now: () => string;
  private readonly generateId: () => string;
  private readonly defaultWorkerId: string;
  private readonly leaseSeconds: number;

  constructor(options: MarketingPublisherServiceOptions) {
    this.marketingRepository = options.marketingRepository;
    this.publisherRegistry = options.publisherRegistry;
    this.assetStorageReader = options.assetStorageReader;
    this.now = options.now ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? randomUUID;
    this.defaultWorkerId = options.defaultWorkerId ?? `publisher-worker-${randomUUID().slice(0, 8)}`;
    this.leaseSeconds = options.leaseSeconds ?? 30;
  }

  async publishDueTargets(options?: PublishDueTargetsOptions): Promise<readonly PublicationRecord[]> {
    const workerId = options?.workerId ?? this.defaultWorkerId;
    const limit = options?.limit ?? 10;
    const now = this.now();

    const claimedTargets = await this.marketingRepository.claimDuePublicationTargets({
      workerId,
      now,
      leaseSeconds: this.leaseSeconds,
      limit,
    });

    const records: PublicationRecord[] = [];
    for (const target of claimedTargets) {
      try {
        const record = await this.publishTarget(target.id, workerId);
        records.push(record);
      } catch (err) {
        console.error(`Failed to publish claimed target ${target.id}:`, err);
      }
    }

    return records;
  }

  async publishTarget(targetId: string, workerId?: string): Promise<PublicationRecord> {
    const target = await this.marketingRepository.findPublicationTargetById(targetId);
    if (!target) {
      throw new MarketingApplicationError(
        404,
        "PUBLICATION_TARGET_NOT_FOUND",
        `Publication target '${targetId}' was not found.`,
      );
    }

    const pkg = await this.marketingRepository.findPublicationPackageById(target.packageId);
    if (!pkg) {
      throw MarketingApplicationError.packageNotFound(target.packageId);
    }

    const campaign = await this.marketingRepository.findCampaignById(pkg.campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(pkg.campaignId);
    }

    // 1. Idempotency Check: if target already has a publication record, return it
    const existingRecord = await this.marketingRepository.findPublicationRecordByTargetId(target.id);
    if (existingRecord) {
      if (workerId) {
        await this.marketingRepository.releasePublicationTargetLease(target.id, workerId);
      }
      return existingRecord;
    }

    // 2. Storage Check
    if (!this.assetStorageReader) {
      throw MarketingApplicationError.assetStorageUnavailable();
    }

    // 3. Digest Validation
    const computedTargetDigest = calculatePublicationTargetDigest({
      platform: target.platform,
      format: target.format,
      accountConfigurationId: target.accountConfigurationId,
      mediaAssetIds: target.mediaAssetIds,
      caption: target.caption,
      scheduledFor: target.scheduledFor,
      executionMode: target.executionMode,
    });

    if (computedTargetDigest !== target.targetDigest) {
      throw new MarketingApplicationError(
        409,
        "TARGET_DIGEST_MISMATCH",
        `Publication target '${target.id}' digest mismatch. Expected ${target.targetDigest}, got ${computedTargetDigest}.`,
      );
    }

    // 4. Resolve publisher adapter from registry
    const publisher = this.publisherRegistry.resolve(target.platform, target.executionMode);
    if (!publisher) {
      throw new MarketingApplicationError(
        500,
        "PUBLISHER_ADAPTER_NOT_FOUND",
        `No publisher adapter registered for platform '${target.platform}' in mode '${target.executionMode}'.`,
      );
    }

    // 5. Load Visual Assets
    const mediaItems: Array<{ id: string; bytes: Buffer; mimeType: "image/png"; fileName: string }> = [];
    for (const assetId of target.mediaAssetIds) {
      const asset = await this.marketingRepository.findVisualAssetById(assetId);
      if (!asset) {
        throw new MarketingApplicationError(
          404,
          "VISUAL_ASSET_NOT_FOUND",
          `Visual asset '${assetId}' required by target '${target.id}' was not found.`,
        );
      }
      const bytes = await this.assetStorageReader(asset.storageKey);
      mediaItems.push({
        id: asset.id,
        bytes,
        mimeType: asset.mediaType,
        fileName: `${asset.id}.png`,
      });
    }

    // 6. Record Publication Attempt (started)
    const attemptId = this.generateId();
    const attempt: PublicationAttempt = {
      id: attemptId,
      packageId: target.packageId,
      targetId: target.id,
      attemptKey: `target:${target.id}:${attemptId}`,
      platform: target.platform,
      pageConfigurationId: target.accountConfigurationId,
      executionMode: target.executionMode,
      status: "started",
      errorCode: null,
      errorClass: null,
      responseDigest: null,
      startedAt: this.now(),
      finishedAt: null,
    };
    await this.marketingRepository.createPublicationAttempt(attempt);
    await this.marketingRepository.updatePublicationTargetStatus({
      targetId: target.id,
      status: "publishing",
    });

    // 7. Execute publication via adapter
    let receipt: SocialPublicationReceipt;
    try {
      receipt = await publisher.publish({
        target,
        caption: target.caption,
        media: mediaItems,
      });
    } catch (error: any) {
      const errorCode =
        error instanceof SocialPublisherError || error instanceof FacebookPublisherError
          ? error.code
          : error.name || "PUBLICATION_FAILED";
      const errorClass =
        (error instanceof SocialPublisherError || error instanceof FacebookPublisherError) && error.retryable
          ? "retryable"
          : "fatal";
      const targetFailedStatus: PublicationTargetStatus =
        errorCode === "FACEBOOK_PERMISSION_DENIED" || errorCode === "FACEBOOK_POLICY_VIOLATION"
          ? "platform_rejected"
          : "failed";

      await this.marketingRepository.updatePublicationAttempt(
        attemptId,
        "failed",
        this.now(),
        errorCode,
        errorClass,
        null,
      );

      await this.marketingRepository.updatePublicationTargetStatus({
        targetId: target.id,
        status: targetFailedStatus,
      });
      if (workerId) {
        await this.marketingRepository.releasePublicationTargetLease(target.id, workerId);
      }

      await this.synchronizeCampaignState(campaign.id);
      throw error;
    }

    // 8. On Success:
    await this.marketingRepository.updatePublicationAttempt(
      attemptId,
      "succeeded",
      this.now(),
      null,
      null,
      receipt.providerReceiptDigest,
    );

    const record: PublicationRecord = {
      id: this.generateId(),
      packageId: target.packageId,
      targetId: target.id,
      platform: receipt.platform,
      pageId: receipt.pageId || target.accountConfigurationId,
      externalPostId: receipt.externalPublicationId,
      postUrl: receipt.publicationUrl ?? null,
      executionMode: receipt.executionMode,
      simulated: receipt.simulated,
      displayMessage: receipt.displayMessage,
      packageDigest: pkg.packageDigest,
      contentDigest: target.contentDigest,
      imageDigest: target.mediaDigest,
      targetDigest: target.targetDigest,
      providerReceiptDigest: receipt.providerReceiptDigest,
      verificationEvidenceDigest: receipt.verificationEvidenceDigest ?? null,
      verifiedAt: receipt.verifiedAt,
      createdAt: this.now(),
    };

    await this.marketingRepository.createPublicationRecord(record);
    await this.marketingRepository.updatePublicationTargetStatus({
      targetId: target.id,
      status: "verified",
    });

    if (workerId) {
      await this.marketingRepository.releasePublicationTargetLease(target.id, workerId);
    }

    // 9. Synchronize overall campaign status
    await this.synchronizeCampaignState(campaign.id);

    return record;
  }

  async publishApprovedPackage(request: PublishPackageRequest): Promise<PublicationRecord> {
    const { campaignId, packageId } = request;

    const campaign = await this.marketingRepository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    const pkg = await this.marketingRepository.findPublicationPackageById(packageId);
    if (!pkg || pkg.campaignId !== campaignId) {
      throw MarketingApplicationError.packageNotFound(packageId);
    }

    // Idempotency: if any package-level record exists, return it
    const existingPackageRecord = await this.marketingRepository.findPublicationRecordByPackageId(packageId);
    if (existingPackageRecord) {
      return existingPackageRecord;
    }

    let targets = await this.marketingRepository.findPublicationTargetsByPackageId(packageId);
    if (targets.length === 0) {
      // If legacy package has no targets yet, backfill/create a target for this package
      const targetId = this.generateId();
      const legacyTarget: PublicationTarget = {
        id: targetId,
        packageId: pkg.id,
        platform: "facebook",
        format: "feed_image",
        accountConfigurationId: request.pageId || pkg.facebookPageConfigurationId || "facebook-default",
        contentVersionId: pkg.contentVersionId,
        mediaAssetIds: pkg.visualAssetId ? [pkg.visualAssetId] : [],
        caption: "Legacy package publication",
        scheduledFor: pkg.scheduledFor,
        required: true,
        executionMode: "live",
        contentDigest: pkg.contentDigest,
        mediaDigest: pkg.imageDigest || pkg.contentDigest,
        targetDigest: pkg.packageDigest,
        status: "approved",
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      await this.marketingRepository.createPublicationTargets([legacyTarget]);
      targets = [legacyTarget];
    }

    const records: PublicationRecord[] = [];
    for (const target of targets) {
      const record = await this.publishTarget(target.id, this.defaultWorkerId);
      records.push(record);
    }

    return records[0]!;
  }

  private async synchronizeCampaignState(campaignId: string): Promise<void> {
    const campaign = await this.marketingRepository.findCampaignById(campaignId);
    if (!campaign) return;

    const packages = await this.marketingRepository.findPublicationPackagesByCampaignId(campaignId);
    const currentPackage = packages[packages.length - 1];
    if (!currentPackage) return;

    const targets = await this.marketingRepository.findPublicationTargetsByPackageId(currentPackage.id);
    if (targets.length === 0) return;

    const aggregate = deriveAggregatePublicationStatus(targets);

    let nextState: MarketingCampaignState = campaign.state;
    if (aggregate === "verified") {
      nextState = "completed";
    } else if (aggregate === "partial_failure") {
      nextState = "partial_failure";
    } else if (aggregate === "failed") {
      nextState = "failed";
    } else if (aggregate === "publishing") {
      nextState = "publishing";
    }

    if (nextState !== campaign.state) {
      await this.marketingRepository.updateCampaignState(campaign.id, campaign.version, nextState);
    }
  }
}
