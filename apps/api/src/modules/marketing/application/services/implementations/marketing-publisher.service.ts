// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type {
  MarketingPublisherService,
  PublishDueTargetsOptions,
  PublishPackageRequest,
} from "../interfaces/marketing-publisher.service";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import {
  FacebookPublisherError,
  type FacebookPublisherPort,
} from "../../ports/facebook-publisher.port";
import {
  SocialPublisherError,
  type SocialPublisherPort,
  type SocialPublishMediaItem,
} from "../../ports/social-publisher.port";
import type { SocialPublisherRegistry } from "./social-publisher-registry";
import type {
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
import { canTransitionState } from "../../../domain/services/marketing-campaign-rules";

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
    const claimedTargets = await this.marketingRepository.claimDuePublicationTargets({
      workerId,
      now: this.now(),
      leaseSeconds: this.leaseSeconds,
      limit,
    });

    const records: PublicationRecord[] = [];
    for (const target of claimedTargets) {
      try {
        const record = await this.publishTarget(target.id, workerId);
        records.push(record);
      } catch (error) {
        // Continue processing other claimed targets in the batch
      }
    }
    return records;
  }

  async publishTarget(targetId: string, workerId?: string): Promise<PublicationRecord> {
    const target = await this.marketingRepository.findPublicationTargetById(targetId);
    if (!target) {
      throw new MarketingApplicationError(404, "TARGET_NOT_FOUND", `Publication target ${targetId} not found`);
    }

    const pkg = await this.marketingRepository.findPublicationPackageById(target.packageId);
    if (!pkg) {
      throw MarketingApplicationError.packageNotFound(target.packageId);
    }

    const campaign = await this.marketingRepository.findCampaignById(pkg.campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(pkg.campaignId);
    }

    // 1. Idempotency: if already verified and recorded, return existing record
    const existingRecord = await this.marketingRepository.findPublicationRecordByTargetId(targetId);
    if (existingRecord) {
      return existingRecord;
    }

    // 2. Digest invariance check
    const content = await this.marketingRepository.findContentVersionById(target.contentVersionId);
    if (!content) {
      throw new MarketingApplicationError(404, "CONTENT_NOT_FOUND", `Content version ${target.contentVersionId} not found`);
    }

    const expectedTargetDigest = calculatePublicationTargetDigest({
      platform: target.platform,
      format: target.format,
      accountConfigurationId: target.accountConfigurationId,
      contentDigest: target.contentDigest,
      mediaDigest: target.mediaDigest,
      mediaAssetIds: target.mediaAssetIds,
      caption: target.caption,
      scheduledFor: target.scheduledFor,
      executionMode: target.executionMode,
    });

    if (target.targetDigest !== expectedTargetDigest) {
      throw new MarketingApplicationError(
        400,
        "TARGET_DIGEST_MISMATCH",
        `Target digest ${target.targetDigest} does not match expected canonical digest ${expectedTargetDigest}`,
      );
    }

    // 3. Asset storage check
    if (!this.assetStorageReader) {
      throw MarketingApplicationError.assetStorageUnavailable();
    }

    // 4. Fetch media bytes
    const mediaItems: SocialPublishMediaItem[] = [];
    for (const assetId of target.mediaAssetIds) {
      const asset = await this.marketingRepository.findVisualAssetById(assetId);
      if (!asset) {
        throw new MarketingApplicationError(404, "VISUAL_ASSET_NOT_FOUND", `Visual asset ${assetId} not found`);
      }
      const bytes = await this.assetStorageReader(asset.storageKey);
      mediaItems.push({
        id: asset.id,
        bytes,
        mimeType: "image/png",
        fileName: `asset_${asset.id}.png`,
      });
    }

    // 5. Create attempt
    const attemptId = this.generateId();
    const attempt: PublicationAttempt = {
      id: attemptId,
      packageId: target.packageId,
      targetId: target.id,
      attemptKey: this.generateId(),
      platform: target.platform,
      pageConfigurationId: target.accountConfigurationId,
      executionMode: target.executionMode,
      simulated: target.executionMode === "simulation",
      status: "started",
      startedAt: this.now(),
    };
    await this.marketingRepository.createPublicationAttempt(attempt);

    // 6. Update target and campaign to publishing
    await this.marketingRepository.updatePublicationTargetStatus(target.id, "publishing");
    if (campaign.state !== "publishing" && canTransitionState(campaign.state, "publishing")) {
      await this.marketingRepository.updateCampaignState(campaign.id, campaign.version, "publishing");
    }

    // 7. Resolve publisher adapter
    const publisher = this.publisherRegistry.resolve(target.platform, target.executionMode);

    let receipt;
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

      await this.marketingRepository.updatePublicationTargetStatus(target.id, targetFailedStatus);
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
    await this.marketingRepository.updatePublicationTargetStatus(target.id, "verified");

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
      await this.marketingRepository.createPublicationTarget(legacyTarget);
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
    const latestCampaign = await this.marketingRepository.findCampaignById(campaignId);
    if (!latestCampaign) return;

    const pkg = await this.marketingRepository.findCurrentPackageByCampaignId(campaignId);
    if (!pkg) return;

    const targets = await this.marketingRepository.findPublicationTargetsByPackageId(pkg.id);
    if (targets.length === 0) return;

    const aggregate = deriveAggregatePublicationStatus(targets);

    let currentVersion = latestCampaign.version;
    let currentState = latestCampaign.state;

    if (aggregate === "verified") {
      if (canTransitionState(currentState, "verifying_publication")) {
        const step1 = await this.marketingRepository.updateCampaignState(latestCampaign.id, currentVersion, "verifying_publication");
        currentState = step1.state;
        currentVersion = step1.version;
      }
      if (canTransitionState(currentState, "reporting")) {
        const step2 = await this.marketingRepository.updateCampaignState(latestCampaign.id, currentVersion, "reporting");
        currentState = step2.state;
        currentVersion = step2.version;
      }
      if (canTransitionState(currentState, "completed")) {
        await this.marketingRepository.updateCampaignState(latestCampaign.id, currentVersion, "completed");
      }
    } else if (aggregate === "partial_failure") {
      if (canTransitionState(currentState, "partial_failure")) {
        await this.marketingRepository.updateCampaignState(latestCampaign.id, currentVersion, "partial_failure");
      }
    } else if (aggregate === "failed") {
      if (canTransitionState(currentState, "failed")) {
        await this.marketingRepository.updateCampaignState(latestCampaign.id, currentVersion, "failed");
      }
    }
  }
}
