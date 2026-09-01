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
  PublicationTarget,
  PublicationTargetStatus,
  VisualAsset,
} from "../../../domain/entities/marketing-campaign";
import type {
  ClaimDueTargetsInput,
  MarketingRepository,
  UpdateTargetStatusInput,
} from "../../repositories/interfaces/marketing.repository";
import type { CreateMarketingCampaignInput } from "../../dtos/marketing.dto";
import { MarketingCampaignService } from "./marketing-campaign.service";
import { MarketingApplicationError } from "../../../presentation/middleware/marketing-error.middleware";

class InMemoryMarketingRepository implements MarketingRepository {
  public campaigns: Map<string, MarketingCampaign> = new Map();
  public briefs: Map<string, CampaignBrief> = new Map();
  public contents: Map<string, ContentVersion[]> = new Map();
  public visuals: Map<string, VisualAsset[]> = new Map();
  public packages: Map<string, PublicationPackage[]> = new Map();
  public targets: Map<string, PublicationTarget[]> = new Map();
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

  async findCampaignByIdempotencyKey(actorId: string, key: string): Promise<MarketingCampaign | null> {
    for (const campaign of this.campaigns.values()) {
      if (campaign.createdBy === actorId && campaign.idempotencyKey === key) {
        return campaign;
      }
    }
    return null;
  }

  async listCampaigns(): Promise<readonly MarketingCampaign[]> {
    return [...this.campaigns.values()];
  }

  async updateCampaignState(
    id: string,
    expectedVersion: number,
    nextState: MarketingCampaignState,
  ): Promise<MarketingCampaign> {
    const existing = this.campaigns.get(id);
    if (!existing) {
      throw new Error(`Campaign ${id} not found`);
    }
    if (existing.version !== expectedVersion) {
      throw new Error(`Version conflict: expected ${expectedVersion}, got ${existing.version}`);
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

  async createPublicationTargets(targets: readonly PublicationTarget[]): Promise<readonly PublicationTarget[]> {
    for (const target of targets) {
      const list = this.targets.get(target.packageId) ?? [];
      list.push(target);
      this.targets.set(target.packageId, list);
    }
    return targets;
  }
  async findPublicationTargetsByPackageId(packageId: string): Promise<readonly PublicationTarget[]> {
    return this.targets.get(packageId) ?? [];
  }
  async findPublicationTargetById(id: string): Promise<PublicationTarget | null> {
    for (const list of this.targets.values()) {
      const match = list.find((t) => t.id === id);
      if (match) return match;
    }
    return null;
  }
  async claimDuePublicationTargets(options: ClaimDueTargetsInput): Promise<readonly PublicationTarget[]> {
    const result: PublicationTarget[] = [];
    for (const list of this.targets.values()) {
      for (const t of list) {
        if ((t.status === "approved" || t.status === "scheduled") && t.scheduledFor <= options.now) {
          result.push(t);
        }
      }
    }
    return result.slice(0, options.limit);
  }
  async updatePublicationTargetStatus(input: UpdateTargetStatusInput): Promise<PublicationTarget> {
    for (const list of this.targets.values()) {
      const match = list.find((t) => t.id === input.targetId);
      if (match) {
        const updated = { ...match, status: input.status, updatedAt: new Date().toISOString() };
        const idx = list.indexOf(match);
        list[idx] = updated;
        return updated;
      }
    }
    throw new Error("Target not found");
  }
  async releasePublicationTargetLease(): Promise<void> {}
  async findPublicationAttemptsByTargetId(): Promise<readonly PublicationAttempt[]> {
    return [];
  }
  async findPublicationRecordByTargetId(): Promise<PublicationRecord | null> {
    return null;
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

  const validBriefInput: CreateMarketingCampaignInput = {
    idempotencyKey: "test-idem-001",
    assignmentMode: "direct_department",
    campaignName: "NovaPhone 15 Launch",
    objective: "Drive initial awareness and pre-orders for NovaPhone 15 flagship",
    subject: {
      kind: "catalog_product",
      reference: "prod_novaphone_15",
    },
    language: "vi",
    mandatoryMessage: "NovaPhone 15 - Đỉnh cao công nghệ di động 2026",
    prohibitedClaims: ["chữa bách bệnh", "số 1 toàn cầu"],
    callToAction: "Đặt hàng ngay hôm nay",
    facebookPageConfigurationId: "page-cfg-primary",
    scheduledFor: "2026-08-30T10:00:00.000Z",
    deadline: "2026-08-30T18:00:00.000Z",
    approverId: "staff_manager_01",
    maximumCostMicros: 50_000_000,
    provenance: [{
      sourceType: "user_brief",
      sourceId: "brief_request_01",
      sourceDigest: "d".repeat(64),
      classification: "internal",
    }],
  };

  beforeEach(() => {
    repository = new InMemoryMarketingRepository();
    service = new MarketingCampaignService({
      repository,
      now: () => fixedNow,
    });
  });

  it("creates a campaign in draft state with correct brief and timestamps", async () => {
    const result = await service.createCampaign("operator-1", validBriefInput);
    expect(result.id).toBeDefined();
    expect(result.state).toBe("draft");
    expect(result.version).toBe(1);

    const brief = await repository.findBriefByCampaignId(result.id);
    expect(brief).toBeDefined();
    expect(brief?.campaignName).toBe(validBriefInput.campaignName);
    expect(brief?.facebookPageConfigurationId).toBe(validBriefInput.facebookPageConfigurationId);
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
        objective: "Run paid ads boosting on TikTok",
      }),
    ).rejects.toThrow(/strictly limited to facebook and instagram publication/i);
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

  it("materializes revised PNG bytes, creates multi-platform targets, and enables approval", async () => {
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

    const latestPkg = repository.packages.get(created.id)?.at(-1);
    expect(latestPkg).toMatchObject({
      imageDigest: "f".repeat(64),
      status: "draft",
      approvalRequestId: null,
    });

    const targets = await repository.findPublicationTargetsByPackageId(latestPkg!.id);
    expect(targets).toHaveLength(2);
    expect(targets.some((t) => t.platform === "facebook" && t.format === "feed_image" && t.required)).toBe(true);
    expect(targets.some((t) => t.platform === "instagram" && t.format === "feed_image" && !t.required)).toBe(true);

    // Test approval flow
    await revisionService.approveCampaign("approver-1", created.id, {
      decision: "approve",
    });

    const approvedTargets = await repository.findPublicationTargetsByPackageId(latestPkg!.id);
    expect(approvedTargets.every((t) => t.status === "approved")).toBe(true);
  });
});
