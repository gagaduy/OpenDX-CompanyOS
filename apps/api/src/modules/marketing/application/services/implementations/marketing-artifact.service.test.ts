// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from "vitest";
import { MarketingArtifactServiceImpl } from "./marketing-artifact.service";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import {
  type CampaignBrief,
  type ContentVersion,
  type MarketingArtifact,
  type MarketingCampaign,
  type MarketingCampaignState,
  type PublicationAttempt,
  type PublicationPackage,
  type PublicationPackageStatus,
  type PublicationRecord,
  REQUIRED_MARKETING_ARTIFACT_KINDS,
  type VisualAsset,
} from "../../../domain/entities/marketing-campaign";

class MockMarketingRepository implements MarketingRepository {
  public campaigns: Map<string, MarketingCampaign> = new Map();
  public briefs: Map<string, CampaignBrief> = new Map();
  public contents: Map<string, ContentVersion[]> = new Map();
  public visuals: Map<string, VisualAsset[]> = new Map();
  public packages: Map<string, PublicationPackage[]> = new Map();
  public records: Map<string, PublicationRecord> = new Map();
  public artifacts: Map<string, MarketingArtifact> = new Map();

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
    const list = this.contents.get(content.campaignId) ?? [];
    list.push(content);
    this.contents.set(content.campaignId, list);
    return content;
  }
  async findContentVersionsByCampaignId(campaignId: string): Promise<readonly ContentVersion[]> {
    return this.contents.get(campaignId) ?? [];
  }
  async findContentVersionById(id: string): Promise<ContentVersion | null> {
    for (const list of this.contents.values()) {
      const match = list.find((c) => c.id === id);
      if (match) return match;
    }
    return null;
  }
  async createVisualAsset(asset: VisualAsset): Promise<VisualAsset> {
    const list = this.visuals.get(asset.campaignId) ?? [];
    list.push(asset);
    this.visuals.set(asset.campaignId, list);
    return asset;
  }
  async findVisualAssetsByCampaignId(campaignId: string): Promise<readonly VisualAsset[]> {
    return this.visuals.get(campaignId) ?? [];
  }
  async findVisualAssetById(id: string): Promise<VisualAsset | null> {
    for (const list of this.visuals.values()) {
      const match = list.find((v) => v.id === id);
      if (match) return match;
    }
    return null;
  }
  async createPublicationPackage(pkg: PublicationPackage): Promise<PublicationPackage> {
    const list = this.packages.get(pkg.campaignId) ?? [];
    list.push(pkg);
    this.packages.set(pkg.campaignId, list);
    return pkg;
  }
  async findPublicationPackagesByCampaignId(campaignId: string): Promise<readonly PublicationPackage[]> {
    return this.packages.get(campaignId) ?? [];
  }
  async findPublicationPackageById(id: string): Promise<PublicationPackage | null> {
    for (const list of this.packages.values()) {
      const match = list.find((p) => p.id === id);
      if (match) return match;
    }
    return null;
  }
  async findCurrentPackageByCampaignId(campaignId: string): Promise<PublicationPackage | null> {
    const list = this.packages.get(campaignId) ?? [];
    return list[list.length - 1] ?? null;
  }
  async updatePublicationPackageStatus(id: string, status: PublicationPackageStatus): Promise<PublicationPackage> {
    for (const list of this.packages.values()) {
      const pkg = list.find((p) => p.id === id);
      if (pkg) {
        const updated = { ...pkg, status };
        return updated;
      }
    }
    throw new Error("Not found");
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
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }
  async findArtifactsByCampaignId(campaignId: string): Promise<readonly MarketingArtifact[]> {
    return [...this.artifacts.values()].filter((a) => a.campaignId === campaignId);
  }
  async findArtifactById(id: string): Promise<MarketingArtifact | null> {
    return this.artifacts.get(id) ?? null;
  }
}

describe("MarketingArtifactService", () => {
  let repository: MockMarketingRepository;
  let service: MarketingArtifactServiceImpl;

  const fixedNow = "2026-08-29T10:00:00.000Z";
  const campaignId = "00000000-0000-4000-8000-000000000001";
  const contentId = "00000000-0000-4000-8000-000000000002";
  const visualId = "00000000-0000-4000-8000-000000000003";

  beforeEach(() => {
    repository = new MockMarketingRepository();

    repository.campaigns.set(campaignId, {
      id: campaignId,
      state: "completed",
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
      campaignName: "NovaPhone 15 Launch",
      objective: "Drive pre-orders",
      subjectKind: "catalog_product",
      subjectReference: "novaphone-15",
      audience: "Tech lovers",
      language: "vi",
      tone: "Exciting",
      mandatoryMessage: "Order today",
      prohibitedClaims: ["100% cure"],
      callToAction: "Order at NovaCommerce Store",
      facebookPageConfigurationId: "page-1",
      scheduledFor: fixedNow,
      deadline: fixedNow,
      approverId: "approver-1",
      maximumCostMicros: 0,
      provenance: [],
      version: 1,
      createdAt: fixedNow,
    });

    repository.contents.set(campaignId, [
      {
        id: contentId,
        campaignId,
        versionNumber: 1,
        variant: "feed_post_square",
        headline: "NovaPhone 15",
        body: "Introducing NovaPhone 15.",
        callToAction: "Order at NovaCommerce Store",
        hashtags: ["#novaphone"],
        visualDirection: "Square render",
        factualClaimSourceIds: [],
        contentDigest: "c".repeat(64),
        modelRunId: null,
        costMicros: 0,
        createdAt: fixedNow,
      },
    ]);

    repository.visuals.set(campaignId, [
      {
        id: visualId,
        campaignId,
        versionNumber: 1,
        mediaType: "image/png",
        aspectRatio: "1:1",
        width: 1080,
        height: 1080,
        byteSize: 1024,
        imageDigest: "d".repeat(64),
        altText: "NovaPhone 15",
        storageKey: "marketing/visuals/hero.png",
        modelRunId: null,
        costMicros: 0,
        createdAt: fixedNow,
      },
    ]);

    service = new MarketingArtifactServiceImpl({
      marketingRepository: repository,
      now: () => fixedNow,
    });
  });

  it("generates all 5 required marketing deliverables with non-empty bytes and valid digests", async () => {
    const deliverables = await service.generateAllDeliverables(campaignId);

    expect(deliverables).toHaveLength(5);

    const generatedKinds = deliverables.map((d) => d.kind);
    for (const requiredKind of REQUIRED_MARKETING_ARTIFACT_KINDS) {
      expect(generatedKinds).toContain(requiredKind);
    }

    for (const d of deliverables) {
      expect(d.campaignId).toBe(campaignId);
      expect(d.byteSize).toBeGreaterThan(0);
      expect(d.sha256Digest).toMatch(/^[a-f0-9]{64}$/);
      expect(d.filename).toBeTruthy();
    }
  });

  it("retrieves generated artifact payload and buffer", async () => {
    const deliverables = await service.generateAllDeliverables(campaignId);
    const firstArtifact = deliverables[0]!;

    const payload = await service.getArtifactPayload(firstArtifact.id);
    expect(payload).not.toBeNull();
    expect(payload?.artifact.id).toBe(firstArtifact.id);
    expect(payload?.buffer.length).toBe(firstArtifact.byteSize);
  });
});
