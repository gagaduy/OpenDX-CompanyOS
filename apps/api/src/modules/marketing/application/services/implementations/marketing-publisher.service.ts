// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type {
  MarketingPublisherService,
  PublishPackageRequest,
} from "../interfaces/marketing-publisher.service";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import {
  FacebookPublisherError,
  type FacebookPublisherPort,
} from "../../ports/facebook-publisher.port";
import type {
  PublicationAttempt,
  PublicationRecord,
} from "../../../domain/entities/marketing-campaign";
import { MarketingApplicationError } from "../../../presentation/middleware/marketing-error.middleware";
import { canTransitionState } from "../../../domain/services/marketing-campaign-rules";

export interface MarketingPublisherServiceOptions {
  readonly marketingRepository: MarketingRepository;
  readonly facebookPublisher: FacebookPublisherPort;
  readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  readonly now?: () => string;
  readonly generateId?: () => string;
}

export class MarketingPublisherServiceImpl implements MarketingPublisherService {
  private readonly marketingRepository: MarketingRepository;
  private readonly facebookPublisher: FacebookPublisherPort;
  private readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  private readonly now: () => string;
  private readonly generateId: () => string;

  constructor(options: MarketingPublisherServiceOptions) {
    this.marketingRepository = options.marketingRepository;
    this.facebookPublisher = options.facebookPublisher;
    this.assetStorageReader = options.assetStorageReader;
    this.now = options.now ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? randomUUID;
  }

  async publishApprovedPackage(request: PublishPackageRequest): Promise<PublicationRecord> {
    const { campaignId, packageId, pageId, pageAccessToken } = request;

    const campaign = await this.marketingRepository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    const pkg = await this.marketingRepository.findPublicationPackageById(packageId);
    if (!pkg || pkg.campaignId !== campaignId) {
      throw MarketingApplicationError.packageNotFound(packageId);
    }

    // Idempotency check: if already published, return existing publication record
    const existingRecord = await this.marketingRepository.findPublicationRecordByPackageId(packageId);
    if (existingRecord) {
      return existingRecord;
    }

    // Must be in approved status and have approvalRequestId
    if (pkg.status !== "approved" && campaign.state !== "awaiting_human_approval" && campaign.state !== "publishing") {
      throw MarketingApplicationError.packageNotApproved(packageId);
    }

    const content = await this.marketingRepository.findContentVersionById(pkg.contentVersionId);
    const visual = await this.marketingRepository.findVisualAssetById(pkg.visualAssetId);

    if (!content) {
      throw new MarketingApplicationError(404, "CONTENT_NOT_FOUND", `Content version ${pkg.contentVersionId} not found`);
    }
    if (!visual) {
      throw new MarketingApplicationError(404, "VISUAL_ASSET_NOT_FOUND", `Visual asset ${pkg.visualAssetId} not found`);
    }

    if (!this.assetStorageReader) {
      throw MarketingApplicationError.assetStorageUnavailable();
    }
    const imageBuffer = await this.assetStorageReader(visual.storageKey);

    const parts: string[] = [];
    const text = (content as any).primaryText ?? content.body ?? "";
    if (text) parts.push(text);
    const headline = (content as any).headline;
    if (headline) parts.push(headline);
    const cta = content.callToAction;
    if (cta) parts.push(cta);
    if (content.hashtags && content.hashtags.length > 0) {
      parts.push(content.hashtags.join(" "));
    }
    const message = parts.join("\n\n");

    const attemptId = this.generateId();
    const attempt: PublicationAttempt = {
      id: attemptId,
      packageId: pkg.id,
      attemptKey: this.generateId(),
      platform: "facebook",
      pageConfigurationId: pkg.facebookPageConfigurationId || "primary",
      status: "started",
      startedAt: this.now(),
    };

    await this.marketingRepository.createPublicationAttempt(attempt);

    // Transition campaign state to publishing
    if (campaign.state !== "publishing" && canTransitionState(campaign.state, "publishing")) {
      await this.marketingRepository.updateCampaignState(campaign.id, campaign.version, "publishing");
    }

    let publishResult;
    try {
      publishResult = await this.facebookPublisher.publishImagePost({
        pageId,
        pageAccessToken,
        message,
        imageBuffer,
        imageFileName: "creative.png",
        mimeType: "image/png",
      });
    } catch (error: any) {
      const errorCode = error instanceof FacebookPublisherError ? error.code : "PUBLICATION_FAILED";
      const errorClass = error instanceof FacebookPublisherError && error.retryable ? "retryable" : "fatal";

      await this.marketingRepository.updatePublicationAttempt(
        attemptId,
        "failed",
        this.now(),
        errorCode,
        errorClass,
        null,
      );

      if (!error?.retryable) {
        const latestCamp = await this.marketingRepository.findCampaignById(campaignId);
        if (latestCamp && canTransitionState(latestCamp.state, "failed")) {
          await this.marketingRepository.updateCampaignState(latestCamp.id, latestCamp.version, "failed");
        }
      }

      throw error;
    }

    // On Success:
    await this.marketingRepository.updatePublicationAttempt(
      attemptId,
      "succeeded",
      this.now(),
      null,
      null,
      publishResult.rawResponseDigest,
    );

    const record: PublicationRecord = {
      id: this.generateId(),
      packageId: pkg.id,
      platform: "facebook",
      pageId,
      externalPostId: publishResult.postId,
      postUrl: publishResult.postUrl,
      packageDigest: pkg.packageDigest,
      contentDigest: pkg.contentDigest,
      imageDigest: pkg.imageDigest,
      verifiedAt: this.now(),
      providerReceiptDigest: publishResult.rawResponseDigest,
      createdAt: this.now(),
    };

    await this.marketingRepository.createPublicationRecord(record);

    // Advance campaign state to completed (verifying_publication -> reporting -> completed)
    const latestCamp = await this.marketingRepository.findCampaignById(campaignId);
    if (latestCamp) {
      let currentVersion = latestCamp.version;
      let currentState = latestCamp.state;

      if (canTransitionState(currentState, "verifying_publication")) {
        const step1 = await this.marketingRepository.updateCampaignState(latestCamp.id, currentVersion, "verifying_publication");
        currentState = step1.state;
        currentVersion = step1.version;
      }
      if (canTransitionState(currentState, "reporting")) {
        const step2 = await this.marketingRepository.updateCampaignState(latestCamp.id, currentVersion, "reporting");
        currentState = step2.state;
        currentVersion = step2.version;
      }
      if (canTransitionState(currentState, "completed")) {
        await this.marketingRepository.updateCampaignState(latestCamp.id, currentVersion, "completed");
      }
    }

    return record;
  }
}
