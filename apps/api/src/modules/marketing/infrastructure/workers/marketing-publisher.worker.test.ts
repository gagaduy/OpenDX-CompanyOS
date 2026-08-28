// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingPublisherWorker } from "./marketing-publisher.worker";
import type { MarketingPublisherService } from "../../application/services/interfaces/marketing-publisher.service";
import type { MarketingRepository } from "../../application/repositories/interfaces/marketing.repository";
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
  public packages: Map<string, PublicationPackage> = new Map();

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
    return content;
  }
  async findContentVersionsByCampaignId(): Promise<readonly ContentVersion[]> {
    return [];
  }
  async findContentVersionById(): Promise<ContentVersion | null> {
    return null;
  }
  async createVisualAsset(asset: VisualAsset): Promise<VisualAsset> {
    return asset;
  }
  async findVisualAssetsByCampaignId(): Promise<readonly VisualAsset[]> {
    return [];
  }
  async findVisualAssetById(): Promise<VisualAsset | null> {
    return null;
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
  async updatePublicationPackageStatus(id: string, status: PublicationPackageStatus): Promise<PublicationPackage> {
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error("Not found");
    const updated = { ...pkg, status };
    this.packages.set(id, updated);
    return updated;
  }
  async createPublicationAttempt(attempt: PublicationAttempt): Promise<PublicationAttempt> {
    return attempt;
  }
  async updatePublicationAttempt(): Promise<PublicationAttempt> {
    throw new Error("Not implemented");
  }
  async findPublicationAttemptsByPackageId(): Promise<readonly PublicationAttempt[]> {
    return [];
  }
  async createPublicationRecord(record: PublicationRecord): Promise<PublicationRecord> {
    return record;
  }
  async findPublicationRecordByPackageId(): Promise<PublicationRecord | null> {
    return null;
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

describe("MarketingPublisherWorker", () => {
  let repository: MockMarketingRepository;
  let mockPublisherService: MarketingPublisherService;
  let worker: MarketingPublisherWorker;

  const fixedNow = "2026-08-29T10:00:00.000Z";
  const campaignId = "00000000-0000-4000-8000-000000000001";
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

    repository.briefs.set(campaignId, {
      id: "brief-1",
      campaignId,
      campaignName: "Launch",
      objective: "Obj",
      subjectKind: "catalog_product",
      subjectReference: "ref",
      audience: null,
      language: "vi",
      tone: null,
      mandatoryMessage: "Msg",
      prohibitedClaims: [],
      callToAction: "CTA",
      facebookPageConfigurationId: "100200",
      scheduledFor: fixedNow,
      deadline: fixedNow,
      approverId: "approver-1",
      maximumCostMicros: 0,
      provenance: [],
      version: 1,
      createdAt: fixedNow,
    });

    repository.packages.set(packageId, {
      id: packageId,
      campaignId,
      packageVersion: 1,
      contentVersionId: "content-1",
      visualAssetId: "visual-1",
      facebookPageConfigurationId: "100200",
      scheduledFor: fixedNow,
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      packageDigest: "p".repeat(64),
      status: "approved",
      approvalRequestId: "approval-1",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    mockPublisherService = {
      publishApprovedPackage: vi.fn().mockResolvedValue({
        id: "record-1",
        packageId,
        platform: "facebook",
        pageId: "100200",
        externalPostId: "100200_998877",
        postUrl: "https://www.facebook.com/100200/posts/998877",
        packageDigest: "p".repeat(64),
        contentDigest: "c".repeat(64),
        imageDigest: "d".repeat(64),
        verifiedAt: fixedNow,
        providerReceiptDigest: "r".repeat(64),
        createdAt: fixedNow,
      }),
    };

    worker = new MarketingPublisherWorker({
      publisherService: mockPublisherService,
      marketingRepository: repository,
      getPageAccessToken: async () => "test-token-123",
      pollIntervalMs: 1000,
    });
  });

  it("processes approved package on runOnce", async () => {
    const processed = await worker.runOnce();
    expect(processed).toBe(1);
    expect(mockPublisherService.publishApprovedPackage).toHaveBeenCalledWith({
      campaignId,
      packageId,
      pageId: "100200",
      pageAccessToken: "test-token-123",
    });
  });

  it("can start and stop cleanly", () => {
    worker.start();
    worker.stop();
  });
});
