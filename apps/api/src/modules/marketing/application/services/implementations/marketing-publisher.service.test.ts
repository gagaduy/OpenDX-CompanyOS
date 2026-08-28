// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingPublisherServiceImpl } from "./marketing-publisher.service";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import {
  FacebookPublisherError,
  type FacebookPublisherPort,
} from "../../ports/facebook-publisher.port";
import type {
  CampaignBrief,
  ContentVersion,
  MarketingArtifact,
  MarketingCampaign,
  MarketingCampaignState,
  PublicationAttempt,
  PublicationPackage,
  PublicationPackageStatus,
  PublicationRecord,
  VisualAsset,
} from "../../../domain/entities/marketing-campaign";

class MockMarketingRepository implements MarketingRepository {
  public campaigns: Map<string, MarketingCampaign> = new Map();
  public briefs: Map<string, CampaignBrief> = new Map();
  public contents: Map<string, ContentVersion> = new Map();
  public visuals: Map<string, VisualAsset> = new Map();
  public packages: Map<string, PublicationPackage> = new Map();
  public records: Map<string, PublicationRecord> = new Map();
  public attempts: PublicationAttempt[] = [];

  async createCampaign(campaign: MarketingCampaign, brief: CampaignBrief): Promise<MarketingCampaign> {
    this.campaigns.set(campaign.id, campaign);
    this.briefs.set(brief.campaignId, brief);
    return campaign;
  }
  async findCampaignById(id: string): Promise<MarketingCampaign | null> {
    return this.campaigns.get(id) ?? null;
  }
  async findCampaignByIdempotencyKey(): Promise<MarketingCampaign | null> {
    return null;
  }
  async listCampaigns(): Promise<readonly MarketingCampaign[]> {
    return [...this.campaigns.values()];
  }
  async updateCampaignState(id: string, expectedVersion: number, nextState: MarketingCampaignState): Promise<MarketingCampaign> {
    const existing = this.campaigns.get(id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, state: nextState, version: existing.version + 1, updatedAt: new Date().toISOString() };
    this.campaigns.set(id, updated);
    return updated;
  }
  async findBriefByCampaignId(campaignId: string): Promise<CampaignBrief | null> {
    return this.briefs.get(campaignId) ?? null;
  }
  async createContentVersion(content: ContentVersion): Promise<ContentVersion> {
    this.contents.set(content.id, content);
    return content;
  }
  async findContentVersionsByCampaignId(campaignId: string): Promise<readonly ContentVersion[]> {
    return [...this.contents.values()].filter((c) => c.campaignId === campaignId);
  }
  async findContentVersionById(id: string): Promise<ContentVersion | null> {
    return this.contents.get(id) ?? null;
  }
  async createVisualAsset(asset: VisualAsset): Promise<VisualAsset> {
    this.visuals.set(asset.id, asset);
    return asset;
  }
  async findVisualAssetsByCampaignId(campaignId: string): Promise<readonly VisualAsset[]> {
    return [...this.visuals.values()].filter((v) => v.campaignId === campaignId);
  }
  async findVisualAssetById(id: string): Promise<VisualAsset | null> {
    return this.visuals.get(id) ?? null;
  }
  async createPublicationPackage(pkg: PublicationPackage): Promise<PublicationPackage> {
    this.packages.set(pkg.id, pkg);
    return pkg;
  }
  async findPublicationPackagesByCampaignId(campaignId: string): Promise<readonly PublicationPackage[]> {
    return [...this.packages.values()].filter((p) => p.campaignId === campaignId);
  }
  async findPublicationPackageById(id: string): Promise<PublicationPackage | null> {
    return this.packages.get(id) ?? null;
  }
  async findCurrentPackageByCampaignId(campaignId: string): Promise<PublicationPackage | null> {
    const list = [...this.packages.values()].filter((p) => p.campaignId === campaignId);
    return list[list.length - 1] ?? null;
  }
  async updatePublicationPackageStatus(id: string, status: PublicationPackageStatus, approvalRequestId?: string | null): Promise<PublicationPackage> {
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error("Not found");
    const updated = { ...pkg, status, approvalRequestId: approvalRequestId ?? pkg.approvalRequestId };
    this.packages.set(id, updated);
    return updated;
  }
  async createPublicationAttempt(attempt: PublicationAttempt): Promise<PublicationAttempt> {
    this.attempts.push(attempt);
    return attempt;
  }
  async updatePublicationAttempt(id: string, status: PublicationAttempt["status"], finishedAt?: string, errorCode?: string | null, errorClass?: string | null, responseDigest?: string | null): Promise<PublicationAttempt> {
    const idx = this.attempts.findIndex((a) => a.id === id);
    if (idx >= 0) {
      const updated = {
        ...this.attempts[idx]!,
        status,
        finishedAt: finishedAt ?? null,
        errorCode: errorCode ?? null,
        errorClass: errorClass ?? null,
        responseDigest: responseDigest ?? null,
      };
      this.attempts[idx] = updated;
      return updated;
    }
    throw new Error("Attempt not found");
  }
  async findPublicationAttemptsByPackageId(packageId: string): Promise<readonly PublicationAttempt[]> {
    return this.attempts.filter((a) => a.packageId === packageId);
  }
  async createPublicationRecord(record: PublicationRecord): Promise<PublicationRecord> {
    this.records.set(record.packageId, record);
    return record;
  }
  async findPublicationRecordByPackageId(packageId: string): Promise<PublicationRecord | null> {
    return this.records.get(packageId) ?? null;
  }
  async findPublicationRecordByExternalPostId(): Promise<PublicationRecord | null> {
    return null;
  }
  async createArtifact(artifact: MarketingArtifact): Promise<MarketingArtifact> {
    return artifact;
  }
  async findArtifactsByCampaignId(): Promise<readonly MarketingArtifact[]> {
    return [];
  }
  async findArtifactById(): Promise<MarketingArtifact | null> {
    return null;
  }
}

describe("MarketingPublisherService", () => {
  let repository: MockMarketingRepository;
  let mockFacebookPublisher: FacebookPublisherPort;
  let service: MarketingPublisherServiceImpl;

  const fixedNow = "2026-08-29T10:00:00.000Z";
  const campaignId = "00000000-0000-4000-8000-000000000001";
  const contentId = "00000000-0000-4000-8000-000000000002";
  const visualId = "00000000-0000-4000-8000-000000000003";
  const packageId = "00000000-0000-4000-8000-000000000004";

  beforeEach(() => {
    repository = new MockMarketingRepository();

    repository.campaigns.set(campaignId, {
      id: campaignId,
      state: "awaiting_human_approval",
      assignmentMode: "direct_department",
      createdBy: "staff-1",
      idempotencyKey: "key-1",
      sourceTaskId: null,
      version: 1,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    repository.contents.set(contentId, {
      id: contentId,
      campaignId,
      versionNumber: 1,
      hook: "NovaPhone 15 Launch",
      body: "Discover next-gen mobile computing with NovaPhone 15.",
      callToAction: "Order at NovaCommerce Store",
      hashtags: ["#novaphone", "#flagship"],
      visualDirection: "Square product photo",
      factualClaimSourceIds: [],
      contentDigest: "c".repeat(64),
      modelRunId: null,
      costMicros: 0,
      createdAt: fixedNow,
    });

    repository.visuals.set(visualId, {
      id: visualId,
      campaignId,
      versionNumber: 1,
      mediaType: "image/png",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      byteSize: 2048,
      imageDigest: "d".repeat(64),
      altText: "NovaPhone 15",
      storageKey: "marketing/visuals/hero.png",
      modelRunId: null,
      costMicros: 0,
      createdAt: fixedNow,
    });

    repository.packages.set(packageId, {
      id: packageId,
      campaignId,
      packageVersion: 1,
      contentVersionId: contentId,
      visualAssetId: visualId,
      facebookPageConfigurationId: "page-cfg-1",
      scheduledFor: fixedNow,
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      packageDigest: "p".repeat(64),
      status: "approved",
      approvalRequestId: "00000000-0000-4000-8000-000000000005",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    mockFacebookPublisher = {
      publishImagePost: vi.fn().mockResolvedValue({
        postId: "100200_998877",
        postUrl: "https://www.facebook.com/100200/posts/998877",
        publishedAt: fixedNow,
        rawResponseDigest: "e".repeat(64),
      }),
      verifyPageAccess: vi.fn().mockResolvedValue({
        pageId: "100200",
        name: "NovaCommerce Official",
        canPost: true,
      }),
    };

    service = new MarketingPublisherServiceImpl({
      marketingRepository: repository,
      facebookPublisher: mockFacebookPublisher,
      assetStorageReader: vi.fn().mockResolvedValue(Buffer.from("stored-png-bytes")),
      now: () => fixedNow,
      generateId: () => "00000000-0000-4000-8000-000000000099",
    });
  });

  it("fails closed before contacting Facebook when asset storage is unavailable", async () => {
    const serviceWithoutStorage = new MarketingPublisherServiceImpl({
      marketingRepository: repository,
      facebookPublisher: mockFacebookPublisher,
      now: () => fixedNow,
      generateId: () => "00000000-0000-4000-8000-000000000099",
    });

    await expect(
      serviceWithoutStorage.publishApprovedPackage({
        campaignId,
        packageId,
        pageId: "100200",
        pageAccessToken: "token-123",
      }),
    ).rejects.toMatchObject({ errorCode: "MARKETING_ASSET_STORAGE_UNAVAILABLE" });

    expect(mockFacebookPublisher.publishImagePost).not.toHaveBeenCalled();
    expect(repository.attempts).toHaveLength(0);
  });

  it("successfully publishes an approved package and transitions campaign to completed", async () => {
    const record = await service.publishApprovedPackage({
      campaignId,
      packageId,
      pageId: "100200",
      pageAccessToken: "token-123",
    });

    expect(record).toMatchObject({
      packageId,
      platform: "facebook",
      pageId: "100200",
      externalPostId: "100200_998877",
      postUrl: "https://www.facebook.com/100200/posts/998877",
    });

    const campaign = await repository.findCampaignById(campaignId);
    expect(campaign?.state).toBe("completed");

    expect(repository.attempts).toHaveLength(1);
    expect(repository.attempts[0]?.status).toBe("succeeded");
  });

  it("is idempotent and returns existing publication record without re-publishing", async () => {
    // First publication
    const record1 = await service.publishApprovedPackage({
      campaignId,
      packageId,
      pageId: "100200",
      pageAccessToken: "token-123",
    });

    // Replay
    const record2 = await service.publishApprovedPackage({
      campaignId,
      packageId,
      pageId: "100200",
      pageAccessToken: "token-123",
    });

    expect(record2.id).toBe(record1.id);
    expect(mockFacebookPublisher.publishImagePost).toHaveBeenCalledTimes(1);
  });

  it("records failed attempt and transitions state to failed on fatal error", async () => {
    mockFacebookPublisher.publishImagePost = vi.fn().mockRejectedValue(
      new FacebookPublisherError("FACEBOOK_TOKEN_INVALID", "Token invalid", { retryable: false }),
    );

    await expect(
      service.publishApprovedPackage({
        campaignId,
        packageId,
        pageId: "100200",
        pageAccessToken: "invalid-token",
      }),
    ).rejects.toThrowError(FacebookPublisherError);

    expect(repository.attempts).toHaveLength(1);
    expect(repository.attempts[0]?.status).toBe("failed");
    expect(repository.attempts[0]?.errorCode).toBe("FACEBOOK_TOKEN_INVALID");

    const campaign = await repository.findCampaignById(campaignId);
    expect(campaign?.state).toBe("failed");
  });

  it("retries a failed approved package with a fresh attempt and completes", async () => {
    repository.campaigns.set(campaignId, {
      ...repository.campaigns.get(campaignId)!,
      state: "failed",
      version: 2,
    });
    repository.attempts.push({
      id: "00000000-0000-4000-8000-000000000098",
      packageId,
      attemptKey: "failed-attempt",
      platform: "facebook",
      pageConfigurationId: "page-cfg-1",
      status: "failed",
      errorCode: "FACEBOOK_TOKEN_INVALID",
      errorClass: "fatal",
      startedAt: fixedNow,
      finishedAt: fixedNow,
    });

    await service.publishApprovedPackage({
      campaignId,
      packageId,
      pageId: "100200",
      pageAccessToken: "corrected-token",
    });

    expect(repository.attempts).toHaveLength(2);
    expect(repository.attempts[1]?.status).toBe("succeeded");
    expect((await repository.findCampaignById(campaignId))?.state).toBe("completed");
  });
});
