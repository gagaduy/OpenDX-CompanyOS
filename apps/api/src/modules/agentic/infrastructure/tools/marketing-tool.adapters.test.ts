// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from "vitest";
import { MarketingDepartmentToolAdapter, type CatalogProductReader } from "./marketing-tool.adapters";
import type { MarketingRepository } from "../../../marketing/application/repositories/interfaces/marketing.repository";
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
} from "../../../marketing/domain/entities/marketing-campaign";
import type { DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { AgenticApplicationError } from "../../application/services/agentic-application.error";

class MockMarketingRepository implements MarketingRepository {
  public campaigns: Map<string, MarketingCampaign> = new Map();
  public briefs: Map<string, CampaignBrief> = new Map();
  public contents: Map<string, ContentVersion[]> = new Map();
  public visuals: Map<string, VisualAsset[]> = new Map();
  public packages: Map<string, PublicationPackage[]> = new Map();
  public records: Map<string, PublicationRecord> = new Map();

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
    return artifact;
  }
  async findArtifactsByCampaignId(): Promise<readonly MarketingArtifact[]> {
    return [];
  }
  async findArtifactById(): Promise<MarketingArtifact | null> {
    return null;
  }
}

describe("MarketingDepartmentToolAdapter", () => {
  let repository: MockMarketingRepository;
  let adapter: MarketingDepartmentToolAdapter;
  const fixedNow = "2026-08-29T10:00:00.000Z";
  const campaignId = "00000000-0000-4000-8000-000000000001";

  const sampleBrief: CampaignBrief = {
    id: "00000000-0000-4000-8000-000000000002",
    campaignId,
    campaignName: "NovaPhone 15 Launch",
    objective: "Highlight camera performance",
    subjectKind: "catalog_product",
    subjectReference: "novaphone-15",
    audience: "Tech enthusiasts",
    language: "vi",
    tone: "Exciting",
    mandatoryMessage: "Order now for exclusive gift",
    prohibitedClaims: ["100% cure", "guaranteed wealth"],
    callToAction: "Order at NovaCommerce Store",
    facebookPageConfigurationId: "page-cfg-primary",
    scheduledFor: "2026-08-30T10:00:00.000Z",
    deadline: "2026-08-30T18:00:00.000Z",
    approverId: "approver-1",
    maximumCostMicros: 500000,
    provenance: [],
    version: 1,
    createdAt: fixedNow,
  };

  const sampleCampaign: MarketingCampaign = {
    id: campaignId,
    state: "validating",
    assignmentMode: "direct_department",
    createdBy: "operator-1",
    idempotencyKey: "test-idemp-1",
    sourceTaskId: null,
    version: 1,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };

  const mockCatalogReader: CatalogProductReader = {
    async findProductSummary(productId: string) {
      if (productId === "novaphone-15") {
        return {
          id: "novaphone-15",
          title: "NovaPhone 15",
          slug: "novaphone-15",
          description: "Next-gen flagship smartphone",
          defaultPriceVnd: 25000000,
          primaryImageUrl: "https://media.example.com/novaphone-15.jpg",
          isPublished: true,
          variantCount: 3,
        };
      }
      return null;
    },
  };

  beforeEach(() => {
    repository = new MockMarketingRepository();
    repository.campaigns.set(campaignId, sampleCampaign);
    repository.briefs.set(campaignId, sampleBrief);

    adapter = new MarketingDepartmentToolAdapter({
      marketingRepository: repository,
      catalogReader: mockCatalogReader,
      now: () => fixedNow,
      generateId: () => "00000000-0000-4000-8000-000000000099",
    });
  });

  const makeContext = (
    toolName: import("../../application/tools/department-tool-contracts").DepartmentToolName,
    agentKind: import("../../domain/entities/agent-profile").AgentKind,
  ): DepartmentToolExecutionContext => ({
    invocationId: "00000000-0000-4000-8000-000000000088",
    taskId: "00000000-0000-4000-8000-000000000077",
    agentKind: agentKind as any,
    toolName,
    toolVersion: 1,
    attempt: 1,
    correlationId: "00000000-0000-4000-8000-000000000066",
    causationId: "00000000-0000-4000-8000-000000000055",
  });

  it("marketing.fetch_campaign_brief succeeds for marketing_content", async () => {
    const context = makeContext("marketing.fetch_campaign_brief", "marketing_content");
    const result = await adapter.execute(context, { campaign_id: campaignId });
    expect(result.summary).toMatchObject({
      campaign_id: campaignId,
      campaign_name: "NovaPhone 15 Launch",
      mandatory_message: "Order now for exclusive gift",
    });
  });

  it("marketing.fetch_campaign_brief rejects unauthorized agent kinds", async () => {
    const context = makeContext("marketing.fetch_campaign_brief", "catalog");
    await expect(adapter.execute(context, { campaign_id: campaignId })).rejects.toThrow(AgenticApplicationError);
  });

  it("marketing.fetch_catalog_product_summary returns catalog details for marketing_visual", async () => {
    const context = makeContext("marketing.fetch_catalog_product_summary", "marketing_visual");
    const result = await adapter.execute(context, { product_id: "novaphone-15" });
    expect(result.summary).toMatchObject({
      product_id: "novaphone-15",
      title: "NovaPhone 15",
      default_price_vnd: 25000000,
    });
  });

  it("marketing.fetch_catalog_product_summary fails for missing product", async () => {
    const context = makeContext("marketing.fetch_catalog_product_summary", "marketing_visual");
    await expect(adapter.execute(context, { product_id: "non-existent" })).rejects.toThrow(AgenticApplicationError);
  });

  it("marketing.save_content_draft generates draft, validates prohibited claims, and advances state", async () => {
    const context = makeContext("marketing.save_content_draft", "marketing_content");
    const result = await adapter.execute(context, {
      campaign_id: campaignId,
      headline: "Special NovaPhone 15 Deal",
      primary_text: "Get the latest phone today. Order now for exclusive gift.",
      call_to_action: "Shop now",
      hashtags: ["#novaphone"],
    });

    expect(result.summary).toMatchObject({
      campaign_id: campaignId,
      version_number: 1,
      headline: "Special NovaPhone 15 Deal",
    });

    const updated = await repository.findCampaignById(campaignId);
    expect(updated?.state).toBe("visual_creation");
  });

  it("marketing.save_content_draft rejects prohibited claims", async () => {
    const context = makeContext("marketing.save_content_draft", "marketing_content");
    await expect(
      adapter.execute(context, {
        campaign_id: campaignId,
        headline: "100% cure for all bugs",
        primary_text: "Order now for exclusive gift.",
        call_to_action: "Shop now",
        hashtags: [],
      }),
    ).rejects.toThrow(/prohibited claim/i);
  });

  it("marketing.save_content_draft rejects missing mandatory message", async () => {
    const context = makeContext("marketing.save_content_draft", "marketing_content");
    await expect(
      adapter.execute(context, {
        campaign_id: campaignId,
        headline: "Nice phone",
        primary_text: "Just a regular phone message without required gift text.",
        call_to_action: "Shop now",
        hashtags: [],
      }),
    ).rejects.toThrow(/mandatory message/i);
  });

  it("marketing.save_visual_asset rejects invalid non-PNG files", async () => {
    const context = makeContext("marketing.save_visual_asset", "marketing_visual");
    const fakeJpgBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString("base64");

    await expect(
      adapter.execute(context, {
        campaign_id: campaignId,
        asset_name: "poster.png",
        format: "png",
        dimensions: { width: 1080, height: 1080 },
        asset_bytes_base64: fakeJpgBase64,
      }),
    ).rejects.toThrow(/valid PNG image format/i);
  });

  it("marketing.save_visual_asset saves valid PNG and advances campaign state", async () => {
    const context = makeContext("marketing.save_visual_asset", "marketing_visual");
    // Valid 8-byte PNG header
    const validPngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]).toString("base64");

    repository.campaigns.set(campaignId, { ...sampleCampaign, state: "visual_creation" });

    const result = await adapter.execute(context, {
      campaign_id: campaignId,
      asset_name: "hero_banner.png",
      format: "png",
      dimensions: { width: 1080, height: 1080 },
      asset_bytes_base64: validPngBase64,
      prompt_summary: "High quality render of smartphone",
    });

    expect(result.summary).toMatchObject({
      campaign_id: campaignId,
      version_number: 1,
      aspect_ratio: "1:1",
    });

    const updated = await repository.findCampaignById(campaignId);
    expect(updated?.state).toBe("campaign_review");
  });

  it("marketing.assemble_publication_package creates package and advances state", async () => {
    const contentId = "00000000-0000-4000-8000-000000000011";
    const visualId = "00000000-0000-4000-8000-000000000022";

    await repository.createContentVersion({
      id: contentId,
      campaignId,
      versionNumber: 1,
      hook: "Headline",
      body: "Text",
      callToAction: "CTA",
      hashtags: [],
      visualDirection: "Visual",
      factualClaimSourceIds: [],
      contentDigest: "a".repeat(64),
      costMicros: 0,
      createdAt: fixedNow,
    });

    await repository.createVisualAsset({
      id: visualId,
      campaignId,
      versionNumber: 1,
      mediaType: "image/png",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      byteSize: 1024,
      imageDigest: "b".repeat(64),
      altText: "asset.png",
      storageKey: "test",
      costMicros: 0,
      createdAt: fixedNow,
    });

    repository.campaigns.set(campaignId, { ...sampleCampaign, state: "campaign_review" });

    const context = makeContext("marketing.assemble_publication_package", "marketing_publisher");
    const result = await adapter.execute(context, {
      campaign_id: campaignId,
      content_version_id: contentId,
      visual_asset_id: visualId,
    });

    expect(result.summary).toMatchObject({
      campaign_id: campaignId,
      content_version_id: contentId,
      visual_asset_id: visualId,
      status: "draft",
    });

    const updated = await repository.findCampaignById(campaignId);
    expect(updated?.state).toBe("awaiting_human_approval");
  });

  it("marketing.fetch_publication_status returns campaign publication state", async () => {
    const context = makeContext("marketing.fetch_publication_status", "marketing_publisher");
    const result = await adapter.execute(context, { campaign_id: campaignId });

    expect(result.summary).toMatchObject({
      campaign_id: campaignId,
      campaign_state: "validating",
      package_id: null,
      published_at: null,
    });
  });
});
