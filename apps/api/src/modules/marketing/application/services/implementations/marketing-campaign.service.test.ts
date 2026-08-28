// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
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
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import type { CreateMarketingCampaignInput } from "../../dtos/marketing.dto";
import { MarketingCampaignService } from "./marketing-campaign.service";
import { MarketingApplicationError } from "../../../presentation/middleware/marketing-error.middleware";

class InMemoryMarketingRepository implements MarketingRepository {
  public campaigns: Map<string, MarketingCampaign> = new Map();
  public briefs: Map<string, CampaignBrief> = new Map();
  public contents: Map<string, ContentVersion[]> = new Map();
  public visuals: Map<string, VisualAsset[]> = new Map();
  public packages: Map<string, PublicationPackage[]> = new Map();
  public attempts: Map<string, PublicationAttempt[]> = new Map();
  public records: Map<string, PublicationRecord> = new Map();
  public artifacts: Map<string, MarketingArtifact[]> = new Map();

  async createCampaign(campaign: MarketingCampaign, brief: CampaignBrief): Promise<MarketingCampaign> {
    this.campaigns.set(campaign.id, campaign);
    this.briefs.set(brief.campaignId, brief);
    return campaign;
  }

  async findCampaignById(id: string): Promise<MarketingCampaign | null> {
    return this.campaigns.get(id) ?? null;
  }

  async findCampaignByIdempotencyKey(createdBy: string, idempotencyKey: string): Promise<MarketingCampaign | null> {
    for (const c of this.campaigns.values()) {
      if (c.createdBy === createdBy && c.idempotencyKey === idempotencyKey) {
        return c;
      }
    }
    return null;
  }

  async listCampaigns(): Promise<readonly MarketingCampaign[]> {
    return [...this.campaigns.values()];
  }

  async updateCampaignState(id: string, expectedVersion: number, nextState: MarketingCampaignState): Promise<MarketingCampaign> {
    const existing = this.campaigns.get(id);
    if (!existing || existing.version !== expectedVersion) {
      throw new Error("Concurrency error");
    }
    const updated: MarketingCampaign = {
      ...existing,
      state: nextState,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
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

  async findContentVersionById(): Promise<ContentVersion | null> {
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

  async findVisualAssetById(): Promise<VisualAsset | null> {
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

  async findPublicationPackageById(): Promise<PublicationPackage | null> {
    return null;
  }

  async findCurrentPackageByCampaignId(campaignId: string): Promise<PublicationPackage | null> {
    const list = this.packages.get(campaignId) ?? [];
    return list[list.length - 1] ?? null;
  }

  async updatePublicationPackageStatus(id: string, status: PublicationPackageStatus, approvalRequestId?: string | null): Promise<PublicationPackage> {
    for (const list of this.packages.values()) {
      const pkg = list.find((p) => p.id === id);
      if (pkg) {
        const updated = { ...pkg, status, approvalRequestId: approvalRequestId ?? pkg.approvalRequestId };
        return updated;
      }
    }
    throw new Error("Not found");
  }

  async createPublicationAttempt(attempt: PublicationAttempt): Promise<PublicationAttempt> {
    const list = this.attempts.get(attempt.packageId) ?? [];
    list.push(attempt);
    this.attempts.set(attempt.packageId, list);
    return attempt;
  }

  async updatePublicationAttempt(): Promise<PublicationAttempt> {
    throw new Error("Not implemented");
  }

  async findPublicationAttemptsByPackageId(packageId: string): Promise<readonly PublicationAttempt[]> {
    return this.attempts.get(packageId) ?? [];
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
    const list = this.artifacts.get(artifact.campaignId) ?? [];
    list.push(artifact);
    this.artifacts.set(artifact.campaignId, list);
    return artifact;
  }

  async findArtifactsByCampaignId(campaignId: string): Promise<readonly MarketingArtifact[]> {
    return this.artifacts.get(campaignId) ?? [];
  }

  async findArtifactById(): Promise<MarketingArtifact | null> {
    return null;
  }
}

describe("MarketingCampaignService", () => {
  let repository: InMemoryMarketingRepository;
  let service: MarketingCampaignService;
  const fixedNow = "2026-08-29T10:00:00.000Z";

  beforeEach(() => {
    repository = new InMemoryMarketingRepository();
    service = new MarketingCampaignService({
      repository,
      generateId: () => "00000000-0000-4000-8000-000000000001",
      now: () => fixedNow,
    });
  });

  const validBriefInput: CreateMarketingCampaignInput = {
    assignmentMode: "direct_department",
    idempotencyKey: "test-idemp-key-1",
    campaignName: "NovaPhone 15 Launch",
    objective: "Highlight flagship camera and performance",
    subject: { kind: "catalog_product", reference: "novaphone-15" },
    audience: "Tech early adopters",
    language: "vi",
    tone: "Inspiring and Premium",
    mandatoryMessage: "Order now for exclusive early bird gift",
    prohibitedClaims: ["No medical claims"],
    callToAction: "Pre-order at NovaCommerce Store",
    facebookPageConfigurationId: "page-cfg-primary",
    scheduledFor: "2026-08-30T10:00:00.000Z",
    deadline: "2026-08-30T18:00:00.000Z",
    approverId: "staff-approver-1",
    maximumCostMicros: 500000,
    provenance: [
      {
        sourceType: "catalog_snapshot",
        sourceId: "novaphone-15",
        sourceDigest: "a".repeat(64),
        classification: "internal",
      },
    ],
  };

  it("creates a campaign in draft state with direct intake", async () => {
    const created = await service.createCampaign("operator-1", validBriefInput);
    expect(created.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(created.state).toBe("draft");
    expect(created.assignmentMode).toBe("direct_department");
    expect(created.createdBy).toBe("operator-1");
  });

  it("returns exact replay on same idempotency key and matching brief", async () => {
    const first = await service.createCampaign("operator-1", validBriefInput);
    const second = await service.createCampaign("operator-1", validBriefInput);
    expect(first).toEqual(second);
  });

  it("throws conflict error when reusing idempotency key with different payload", async () => {
    await service.createCampaign("operator-1", validBriefInput);
    await expect(
      service.createCampaign("operator-1", {
        ...validBriefInput,
        campaignName: "Different Name",
      }),
    ).rejects.toThrow(MarketingApplicationError);
  });

  it("rejects out-of-scope work deterministically", async () => {
    await expect(
      service.createCampaign("operator-1", {
        ...validBriefInput,
        objective: "Run paid ads boosting on TikTok and Instagram",
      }),
    ).rejects.toThrow(/strictly limited to single facebook page image post publication/i);
  });

  it("rejects cross-department tasks without executing", async () => {
    await expect(
      service.createCampaign("operator-1", {
        ...validBriefInput,
        objective: "Perform inventory adjustment and refund order",
      }),
    ).rejects.toThrow(/coordination with another department/i);
  });

  it("rejects scheduled time in the past", async () => {
    await expect(
      service.createCampaign("operator-1", {
        ...validBriefInput,
        scheduledFor: "2026-08-28T00:00:00.000Z", // in the past relative to fixedNow
      }),
    ).rejects.toThrow(/scheduled time must be strictly in the future/i);
  });

  it("rejects deadline before scheduled publication time", async () => {
    await expect(
      service.createCampaign("operator-1", {
        ...validBriefInput,
        scheduledFor: "2026-08-30T10:00:00.000Z",
        deadline: "2026-08-30T09:00:00.000Z",
      }),
    ).rejects.toThrow(/deadline must be at or after the scheduled publication time/i);
  });

  it("transitions draft campaign to validating on markReady", async () => {
    const created = await service.createCampaign("operator-1", validBriefInput);
    const ready = await service.markReady("operator-1", created.id);
    expect(ready.state).toBe("validating");
    expect(ready.version).toBe(2);
  });

  it("cancels an active campaign on cancelCampaign", async () => {
    const created = await service.createCampaign("operator-1", validBriefInput);
    const canceled = await service.cancelCampaign("operator-1", created.id, "Staff request");
    expect(canceled.state).toBe("canceled");
  });

  it("retrieves full campaign detail", async () => {
    const created = await service.createCampaign("operator-1", validBriefInput);
    const detail = await service.getCampaign(created.id);
    expect(detail.campaign.id).toBe(created.id);
    expect(detail.brief?.campaignName).toBe(validBriefInput.campaignName);
    expect(detail.contentVersions).toEqual([]);
  });

  it("materializes revised PNG bytes before persisting visual metadata", async () => {
    const created = await service.createCampaign("operator-1", validBriefInput);
    repository.campaigns.set(created.id, {
      ...repository.campaigns.get(created.id)!,
      state: "campaign_review",
    });
    repository.contents.set(created.id, [{
      id: "00000000-0000-4000-8000-000000000010",
      campaignId: created.id,
      versionNumber: 1,
      hook: "Initial hook",
      body: "Initial body",
      callToAction: "Order now",
      hashtags: ["#NovaCommerce"],
      visualDirection: "Square visual",
      factualClaimSourceIds: [],
      contentDigest: "c".repeat(64),
      modelRunId: null,
      costMicros: 0,
      createdAt: fixedNow,
    }]);
    repository.visuals.set(created.id, [{
      id: "00000000-0000-4000-8000-000000000011",
      campaignId: created.id,
      versionNumber: 1,
      mediaType: "image/png",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      byteSize: 100,
      imageDigest: "d".repeat(64),
      altText: "Initial visual",
      storageKey: `marketing/${created.id}/visual_v1.png`,
      modelRunId: null,
      costMicros: 0,
      createdAt: fixedNow,
    }]);
    repository.packages.set(created.id, [{
      id: "00000000-0000-4000-8000-000000000012",
      campaignId: created.id,
      packageVersion: 1,
      contentVersionId: "00000000-0000-4000-8000-000000000010",
      visualAssetId: "00000000-0000-4000-8000-000000000011",
      facebookPageConfigurationId: "page-cfg-primary",
      scheduledFor: validBriefInput.scheduledFor,
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      packageDigest: "p".repeat(64),
      status: "approved",
      approvalRequestId: "approver-1",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    }]);

    const materializeVisualAsset = vi.fn().mockResolvedValue({
      byteSize: 2_048,
      imageDigest: "f".repeat(64),
    });
    const revisionService = new MarketingCampaignService({
      repository,
      materializeVisualAsset,
      now: () => fixedNow,
    });

    await revisionService.requestRevision("operator-1", created.id, {
      feedback: "Use a brighter visual",
      targetVersion: "both",
    });

    expect(materializeVisualAsset).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: created.id,
      versionNumber: 2,
      storageKey: `marketing/${created.id}/visual_v2.png`,
      mediaType: "image/png",
      width: 1080,
      height: 1080,
    }));
    expect(repository.visuals.get(created.id)?.at(-1)).toMatchObject({
      byteSize: 2_048,
      imageDigest: "f".repeat(64),
    });
    expect(repository.packages.get(created.id)?.at(-1)).toMatchObject({
      imageDigest: "f".repeat(64),
      status: "draft",
      approvalRequestId: null,
    });
  });
});
