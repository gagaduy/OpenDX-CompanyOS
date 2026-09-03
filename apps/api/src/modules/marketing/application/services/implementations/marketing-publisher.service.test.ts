// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingPublisherServiceImpl } from "./marketing-publisher.service";
import type {
  ClaimDueTargetsInput,
  MarketingRepository,
  UpdateTargetStatusInput,
} from "../../repositories/interfaces/marketing.repository";
import {
  type SocialPublisherPort,
} from "../../ports/social-publisher.port";
import { SocialPublisherRegistry } from "./social-publisher-registry";
import { FakeInstagramPublisherAdapter } from "../../../infrastructure/adapters/fake-instagram-publisher.adapter";
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
  VisualAsset,
} from "../../../domain/entities/marketing-campaign";
import { calculatePublicationTargetDigest } from "../../../domain/services/marketing-publication-policy";

class MockMarketingRepository implements MarketingRepository {
  public campaigns: Map<string, MarketingCampaign> = new Map();
  public briefs: Map<string, CampaignBrief> = new Map();
  public contents: Map<string, ContentVersion> = new Map();
  public visuals: Map<string, VisualAsset> = new Map();
  public packages: Map<string, PublicationPackage> = new Map();
  public targets: Map<string, PublicationTarget> = new Map();
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
    if (pkg.targets) {
      for (const t of pkg.targets) {
        this.targets.set(t.id, t);
      }
    }
    return pkg;
  }
  async findPublicationPackagesByCampaignId(campaignId: string): Promise<readonly PublicationPackage[]> {
    return [...this.packages.values()].filter((p) => p.campaignId === campaignId);
  }
  async findPublicationPackageById(id: string): Promise<PublicationPackage | null> {
    const pkg = this.packages.get(id);
    if (!pkg) return null;
    const pkgTargets = [...this.targets.values()].filter((t) => t.packageId === id);
    return { ...pkg, targets: pkgTargets };
  }
  async findCurrentPackageByCampaignId(campaignId: string): Promise<PublicationPackage | null> {
    const list = [...this.packages.values()].filter((p) => p.campaignId === campaignId);
    const pkg = list[list.length - 1];
    if (!pkg) return null;
    const pkgTargets = [...this.targets.values()].filter((t) => t.packageId === pkg.id);
    return { ...pkg, targets: pkgTargets };
  }
  async updatePublicationPackageStatus(id: string, status: PublicationPackageStatus, approvalRequestId?: string | null): Promise<PublicationPackage> {
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error("Not found");
    const updated = { ...pkg, status, approvalRequestId: approvalRequestId ?? pkg.approvalRequestId };
    this.packages.set(id, updated);
    return updated;
  }
  async createPublicationTargets(targets: readonly PublicationTarget[]): Promise<readonly PublicationTarget[]> {
    for (const t of targets) {
      this.targets.set(t.id, t);
    }
    return targets;
  }
  async findPublicationTargetById(id: string): Promise<PublicationTarget | null> {
    return this.targets.get(id) ?? null;
  }
  async findPublicationTargetsByPackageId(packageId: string): Promise<readonly PublicationTarget[]> {
    return [...this.targets.values()].filter((t) => t.packageId === packageId);
  }
  async updatePublicationTargetStatus(input: UpdateTargetStatusInput): Promise<PublicationTarget> {
    const t = this.targets.get(input.targetId);
    if (!t) throw new Error("Target not found");
    const updated = { ...t, status: input.status, updatedAt: new Date().toISOString() };
    this.targets.set(input.targetId, updated);
    return updated;
  }
  async claimDuePublicationTargets(options: ClaimDueTargetsInput): Promise<readonly PublicationTarget[]> {
    const due = [...this.targets.values()]
      .filter((t) => (t.status === "approved" || t.status === "scheduled") && t.scheduledFor <= options.now)
      .slice(0, options.limit);
    const claimed: PublicationTarget[] = [];
    for (const t of due) {
      const updated: PublicationTarget = {
        ...t,
        status: "claimed",
        leaseOwner: options.workerId,
        leaseExpiresAt: new Date(Date.now() + options.leaseSeconds * 1000).toISOString(),
        updatedAt: options.now,
      };
      this.targets.set(t.id, updated);
      claimed.push(updated);
    }
    return claimed;
  }
  async releasePublicationTargetLease(targetId: string, workerId: string): Promise<void> {
    const t = this.targets.get(targetId);
    if (t && (t.leaseOwner === workerId || !workerId)) {
      this.targets.set(targetId, { ...t, leaseOwner: null, leaseExpiresAt: null });
    }
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
  async findPublicationAttemptsByTargetId(targetId: string): Promise<readonly PublicationAttempt[]> {
    return this.attempts.filter((a) => a.targetId === targetId);
  }
  async createPublicationRecord(record: PublicationRecord): Promise<PublicationRecord> {
    if (record.targetId) {
      this.records.set(record.targetId, record);
    }
    this.records.set(record.packageId, record);
    return record;
  }
  async findPublicationRecordByPackageId(packageId: string): Promise<PublicationRecord | null> {
    return this.records.get(packageId) ?? null;
  }
  async findPublicationRecordByTargetId(targetId: string): Promise<PublicationRecord | null> {
    return this.records.get(targetId) ?? null;
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
  let registry: SocialPublisherRegistry;
  let mockFbPublisher: SocialPublisherPort;
  let service: MarketingPublisherServiceImpl;
  let idCounter = 1;

  const fixedNow = "2026-08-29T10:00:00.000Z";
  const campaignId = "00000000-0000-4000-8000-000000000001";
  const contentId = "00000000-0000-4000-8000-000000000002";
  const visualId = "00000000-0000-4000-8000-000000000003";
  const packageId = "00000000-0000-4000-8000-000000000004";
  const fbTargetId = "00000000-0000-4000-8000-000000000011";
  const igTargetId = "00000000-0000-4000-8000-000000000012";

  beforeEach(() => {
    idCounter = 1;
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

    const fbTargetDigest = calculatePublicationTargetDigest({
      platform: "facebook",
      format: "feed_image",
      accountConfigurationId: "fb-page-1",
      mediaAssetIds: [visualId],
      caption: "Discover next-gen mobile computing with NovaPhone 15.",
      scheduledFor: fixedNow,
      executionMode: "live",
    });

    const igTargetDigest = calculatePublicationTargetDigest({
      platform: "instagram",
      format: "story_image",
      accountConfigurationId: "ig-acc-1",
      mediaAssetIds: [visualId],
      caption: "Discover next-gen mobile computing with NovaPhone 15.",
      scheduledFor: fixedNow,
      executionMode: "simulation",
    });

    const fbTarget: PublicationTarget = {
      id: fbTargetId,
      packageId,
      platform: "facebook",
      format: "feed_image",
      accountConfigurationId: "fb-page-1",
      contentVersionId: contentId,
      mediaAssetIds: [visualId],
      caption: "Discover next-gen mobile computing with NovaPhone 15.",
      scheduledFor: fixedNow,
      required: true,
      executionMode: "live",
      contentDigest: "c".repeat(64),
      mediaDigest: "d".repeat(64),
      targetDigest: fbTargetDigest,
      status: "approved",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    };

    const igTarget: PublicationTarget = {
      id: igTargetId,
      packageId,
      platform: "instagram",
      format: "story_image",
      accountConfigurationId: "ig-acc-1",
      contentVersionId: contentId,
      mediaAssetIds: [visualId],
      caption: "Discover next-gen mobile computing with NovaPhone 15.",
      scheduledFor: fixedNow,
      required: false,
      executionMode: "simulation",
      contentDigest: "c".repeat(64),
      mediaDigest: "d".repeat(64),
      targetDigest: igTargetDigest,
      status: "approved",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    };

    repository.targets.set(fbTargetId, fbTarget);
    repository.targets.set(igTargetId, igTarget);

    repository.packages.set(packageId, {
      id: packageId,
      campaignId,
      packageVersion: 1,
      contentVersionId: contentId,
      visualAssetId: visualId,
      facebookPageConfigurationId: "fb-page-1",
      scheduledFor: fixedNow,
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      packageDigest: "p".repeat(64),
      status: "approved",
      approvalRequestId: "00000000-0000-4000-8000-000000000005",
      targets: [fbTarget, igTarget],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    mockFbPublisher = {
      platform: "facebook",
      executionMode: "live",
      publish: vi.fn().mockResolvedValue({
        platform: "facebook",
        executionMode: "live",
        simulated: false,
        externalPublicationId: "100200_998877",
        pageId: "fb-page-1",
        publicationUrl: "https://www.facebook.com/100200/posts/998877",
        providerReceiptDigest: "e".repeat(64),
        verificationEvidenceDigest: "f".repeat(64),
        verifiedAt: fixedNow,
        displayMessage: "Published to Facebook",
      }),
      reconcile: vi.fn().mockResolvedValue({ exists: true }),
    };

    registry = new SocialPublisherRegistry();
    registry.register(mockFbPublisher);
    registry.register(new FakeInstagramPublisherAdapter(() => fixedNow));

    service = new MarketingPublisherServiceImpl({
      marketingRepository: repository,
      publisherRegistry: registry,
      assetStorageReader: vi.fn().mockResolvedValue(Buffer.from("stored-png-bytes")),
      now: () => fixedNow,
      generateId: () => `00000000-0000-4000-8000-${String(idCounter++).padStart(12, "0")}`,
      defaultWorkerId: "test-worker-1",
    });
  });

  it("fails closed when asset storage is unavailable", async () => {
    const serviceWithoutStorage = new MarketingPublisherServiceImpl({
      marketingRepository: repository,
      publisherRegistry: registry,
      now: () => fixedNow,
      generateId: () => `00000000-0000-4000-8000-${String(idCounter++).padStart(12, "0")}`,
    });

    await expect(
      serviceWithoutStorage.publishTarget(fbTargetId),
    ).rejects.toMatchObject({ errorCode: "MARKETING_ASSET_STORAGE_UNAVAILABLE" });

    expect(mockFbPublisher.publish).not.toHaveBeenCalled();
    expect(repository.attempts).toHaveLength(0);
  });

  it("publishes claimed targets independently and transitions campaign to completed when all targets verified", async () => {
    // Publish Facebook target
    const fbRecord = await service.publishTarget(fbTargetId, "test-worker-1");
    expect(fbRecord).toMatchObject({
      targetId: fbTargetId,
      platform: "facebook",
      executionMode: "live",
      simulated: false,
      externalPostId: "100200_998877",
    });

    // Publish Instagram target
    const igRecord = await service.publishTarget(igTargetId, "test-worker-1");
    expect(igRecord).toMatchObject({
      targetId: igTargetId,
      platform: "instagram",
      executionMode: "simulation",
      simulated: true,
      displayMessage: "Local simulation - not published to Instagram",
    });

    const campaign = await repository.findCampaignById(campaignId);
    expect(campaign?.state).toBe("completed");

    expect(repository.attempts).toHaveLength(2);
    expect(repository.attempts.every((a) => a.status === "succeeded")).toBe(true);
  });

  it("is idempotent per target and returns existing publication record without re-publishing", async () => {
    const record1 = await service.publishTarget(fbTargetId, "test-worker-1");
    const record2 = await service.publishTarget(fbTargetId, "test-worker-1");

    expect(record2.id).toBe(record1.id);
    expect(mockFbPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it("claims due targets and publishes batch", async () => {
    const records = await service.publishDueTargets({ workerId: "test-worker-1", limit: 10 });
    expect(records).toHaveLength(2);
    expect(records[0]?.platform).toBe("facebook");
    expect(records[1]?.platform).toBe("instagram");

    const campaign = await repository.findCampaignById(campaignId);
    expect(campaign?.state).toBe("completed");
  });

  it("handles partial failure gracefully when an optional target fails", async () => {
    // Optional Instagram target fails
    const fakeFailingIg: SocialPublisherPort = {
      platform: "instagram",
      executionMode: "simulation",
      publish: vi.fn().mockRejectedValue(new Error("Simulation failed")),
      reconcile: vi.fn().mockResolvedValue({ exists: false }),
    };
    registry.register(fakeFailingIg);

    // FB succeeds
    await service.publishTarget(fbTargetId, "test-worker-1");

    // IG fails
    await expect(service.publishTarget(igTargetId, "test-worker-1")).rejects.toThrow("Simulation failed");

    const campaign = await repository.findCampaignById(campaignId);
    expect(campaign?.state).toBe("partial_failure");
  });

  it("executes all targets in publishApprovedPackage even if one target fails", async () => {
    // Make IG (optional) target fail
    const fakeFailingIg: SocialPublisherPort = {
      platform: "instagram",
      executionMode: "simulation",
      publish: vi.fn().mockRejectedValue(new Error("Simulation failed")),
      reconcile: vi.fn().mockResolvedValue({ exists: false }),
    };
    registry.register(fakeFailingIg);

    // Call publishApprovedPackage: IG fails, but FB should still be executed and succeed!
    const record = await service.publishApprovedPackage({
      campaignId,
      packageId,
      pageId: "fb_page_novacommerce_main",
      pageAccessToken: "test-token",
    });

    expect(record.platform).toBe("facebook");
    const campaign = await repository.findCampaignById(campaignId);
    expect(campaign?.state).toBe("partial_failure");
  });
});
