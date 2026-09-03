// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type CampaignBrief,
  type ContentVersion,
  type MarketingArtifact,
  type MarketingCampaign,
  type PublicationAttempt,
  type PublicationPackage,
  type PublicationRecord,
  type PublicationTarget,
  type VisualAsset,
} from "../domain/entities/marketing-campaign";
import {
  assertCanCompleteCampaign,
  assertValidStateTransition,
  canTransitionState,
} from "../domain/services/marketing-campaign-rules";
import {
  calculatePublicationPackageDigest,
  calculatePublicationTargetDigest,
} from "../domain/services/marketing-publication-policy";
import { generateCampaignBriefDocx } from "../infrastructure/generators/campaign-brief-docx.generator";
import { generateFacebookContentDocx } from "../infrastructure/generators/facebook-content-docx.generator";
import { generateFacebookVisualPng } from "../infrastructure/generators/facebook-visual-png.generator";
import { generateFacebookPublicationLogXlsx } from "../infrastructure/generators/facebook-publication-log-xlsx.generator";
import { generateMarketingFinalReportPdf } from "../infrastructure/generators/marketing-final-report-pdf.generator";
import type { FacebookPublisherPort } from "../application/ports/facebook-publisher.port";
import { SocialPublisherRegistry } from "../application/services/implementations/social-publisher-registry";
import { MarketingPublisherServiceImpl } from "../application/services/implementations/marketing-publisher.service";
import { FakeInstagramPublisherAdapter } from "../infrastructure/adapters/fake-instagram-publisher.adapter";

describe("Marketing Facebook Publication End-to-End Workflow Integration", () => {
  it("executes the entire 12-state lifecycle from brief creation to 5 deliverables generation and completion", async () => {
    const campaignId = randomUUID();
    const now = new Date().toISOString();

    // 1. Brief & Campaign initialization
    const brief: CampaignBrief = {
      id: randomUUID(),
      campaignId,
      campaignName: "NovaPhone 15 Pro Max Grand Launch",
      objective: "Drive pre-orders for new flagship device",
      subjectKind: "catalog_product",
      subjectReference: "novaphone-15-pro-max",
      audience: "Tech Enthusiasts",
      language: "vi",
      tone: "Exciting & Professional",
      mandatoryMessage: "Tặng ngay tai nghe không dây khi đặt trước hôm nay",
      prohibitedClaims: ["sản phẩm duy nhất thế giới", "chữa bách bệnh"],
      callToAction: "Đặt trước ngay",
      facebookPageConfigurationId: "page-novacommerce-official",
      scheduledFor: new Date(Date.now() + 3600000).toISOString(),
      deadline: new Date(Date.now() + 86400000).toISOString(),
      approverId: "staff-marketing-lead",
      maximumCostMicros: 500000,
      provenance: [],
      version: 1,
      createdAt: now,
    };

    let campaign: MarketingCampaign = {
      id: campaignId,
      state: "draft",
      assignmentMode: "direct_department",
      createdBy: "staff-lead",
      idempotencyKey: `idemp-${campaignId}`,
      sourceTaskId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Transition: draft -> validating
    expect(canTransitionState("draft", "validating")).toBe(true);
    campaign = { ...campaign, state: "validating", version: 2 };

    // 2. Content Specialist Digital Employee produces copy
    const contentText = "Trải nghiệm đỉnh cao với NovaPhone 15! Tặng ngay tai nghe không dây khi đặt trước hôm nay.";
    const contentDigest = createHash("sha256").update(contentText).digest("hex");

    const contentVersion: ContentVersion = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      hook: "NovaPhone 15 Pro Max Ra Mắt",
      body: contentText,
      callToAction: brief.callToAction,
      hashtags: ["#NovaPhone15", "#NovaCommerce"],
      visualDirection: "1:1 Square studio render",
      factualClaimSourceIds: [],
      contentDigest,
      modelRunId: randomUUID(),
      costMicros: 15000,
      createdAt: now,
    };

    // Rule check: no prohibited claims and mandatory message present
    const fullText = `${contentVersion.hook} ${contentVersion.body}`.toLowerCase();
    expect(fullText).toContain(brief.mandatoryMessage.toLowerCase());
    for (const claim of brief.prohibitedClaims) {
      expect(fullText).not.toContain(claim.toLowerCase());
    }

    // Transition: validating -> content_drafting -> visual_creation
    campaign = { ...campaign, state: "content_drafting", version: 3 };
    campaign = { ...campaign, state: "visual_creation", version: 4 };

    // 3. Visual Specialist Digital Employee produces 1:1 PNG
    const pngResult = generateFacebookVisualPng({
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      mediaType: "image/png",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      byteSize: 1024,
      imageDigest: "",
      altText: "NovaPhone 15 Hero Square Visual",
      storageKey: `marketing/${campaignId}/hero.png`,
      modelRunId: randomUUID(),
      costMicros: 25000,
      createdAt: now,
    } as any);

    const visualAsset: VisualAsset = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      mediaType: "image/png",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      byteSize: pngResult.buffer.length,
      imageDigest: createHash("sha256").update(pngResult.buffer).digest("hex"),
      altText: "NovaPhone 15 Hero Square Visual",
      storageKey: `marketing/${campaignId}/hero.png`,
      modelRunId: randomUUID(),
      costMicros: 25000,
      createdAt: now,
    };

    expect(visualAsset.aspectRatio).toBe("1:1");
    expect(visualAsset.width).toBe(1080);
    expect(visualAsset.height).toBe(1080);

    // 4. Publisher Digital Employee assembles publication package
    const packageDigest = createHash("sha256")
      .update(`${brief.facebookPageConfigurationId}:${contentVersion.contentDigest}:${visualAsset.imageDigest}:${brief.scheduledFor}`)
      .digest("hex");

    let pkg: PublicationPackage = {
      id: randomUUID(),
      campaignId,
      packageVersion: 1,
      contentVersionId: contentVersion.id,
      visualAssetId: visualAsset.id,
      facebookPageConfigurationId: brief.facebookPageConfigurationId,
      scheduledFor: brief.scheduledFor,
      contentDigest: contentVersion.contentDigest,
      imageDigest: visualAsset.imageDigest,
      packageDigest,
      status: "submitted_for_approval",
      approvalRequestId: null,
      createdAt: now,
      updatedAt: now,
    };

    // Transition: visual_creation -> campaign_review -> awaiting_human_approval
    campaign = { ...campaign, state: "campaign_review", version: 5 };
    campaign = { ...campaign, state: "awaiting_human_approval", version: 6 };

    // 5. Human-in-the-loop Staff Approval
    pkg = {
      ...pkg,
      status: "approved",
      approvalRequestId: "staff-director-approval-1",
      updatedAt: new Date().toISOString(),
    };

    // 6. Fail-Closed Publisher Engine execution
    const mockFacebookAdapter: SocialPublisherPort = {
      platform: "facebook",
      executionMode: "live",
      publish: vi.fn().mockResolvedValue({
        platform: "facebook",
        pageId: "page-novacommerce-official",
        externalPublicationId: "page-novacommerce-official_998877",
        publicationUrl: "https://www.facebook.com/page-novacommerce-official/posts/998877",
        executionMode: "live",
        simulated: false,
        displayMessage: "Published to Facebook successfully",
        providerReceiptDigest: "receipt-hash-12345",
        verifiedAt: new Date().toISOString(),
      }),
      reconcile: vi.fn().mockResolvedValue({ exists: true }),
    };

    let publicationRecord: PublicationRecord | null = null;
    const publicationAttempts: PublicationAttempt[] = [];
    let legacyTargets: any[] = [];

    const mockRepo: any = {
      findCampaignById: vi.fn().mockImplementation(async () => campaign),
      findBriefByCampaignId: vi.fn().mockImplementation(async () => brief),
      findPublicationPackageById: vi.fn().mockImplementation(async () => pkg),
      findContentVersionById: vi.fn().mockImplementation(async () => contentVersion),
      findVisualAssetById: vi.fn().mockImplementation(async () => visualAsset),
      findPublicationRecordByPackageId: vi.fn().mockImplementation(async () => publicationRecord),
      findPublicationTargetsByPackageId: vi.fn().mockImplementation(async () => legacyTargets),
      createPublicationTargets: vi.fn().mockImplementation(async (tgts: any[]) => {
        legacyTargets = tgts;
        return tgts;
      }),
      findPublicationTargetById: vi.fn().mockImplementation(async (id: string) => legacyTargets.find((t) => t.id === id) ?? null),
      findPublicationRecordByTargetId: vi.fn().mockImplementation(async () => publicationRecord),
      findPublicationPackagesByCampaignId: vi.fn().mockImplementation(async () => [pkg]),
      updatePublicationTargetStatus: vi.fn().mockImplementation(async ({ targetId, status }: any) => {
        const t = legacyTargets.find((x) => x.id === targetId);
        if (t) t.status = status;
        return t;
      }),
      releasePublicationTargetLease: vi.fn().mockResolvedValue(undefined),
      createPublicationAttempt: vi.fn().mockImplementation(async (att) => {
        publicationAttempts.push(att);
        return att;
      }),
      updatePublicationAttempt: vi.fn().mockImplementation(async (id, update) => {
        const index = publicationAttempts.findIndex((a) => a.id === id);
        if (index >= 0) {
          const existing = publicationAttempts[index]!;
          const updated = { ...existing, ...update };
          publicationAttempts[index] = updated;
          return updated;
        }
        return null;
      }),
      createPublicationRecord: vi.fn().mockImplementation(async (rec) => {
        publicationRecord = rec;
        return rec;
      }),
      updateCampaignState: vi.fn().mockImplementation(async (id, expectedVersion, nextState) => {
        campaign = { ...campaign, state: nextState, version: expectedVersion + 1 };
        return campaign;
      }),
      updatePublicationPackageStatus: vi.fn().mockImplementation(async (id, status) => {
        pkg = { ...pkg, status };
        return pkg;
      }),
    };

    const registry = new SocialPublisherRegistry();
    registry.register(mockFacebookAdapter as any);

    const publisherService = new MarketingPublisherServiceImpl({
      marketingRepository: mockRepo,
      publisherRegistry: registry,
      assetStorageReader: async () => Buffer.from("dummy-png-bytes"),
    });

    // Publish approved package
    const record = await publisherService.publishApprovedPackage({
      campaignId: campaign.id,
      packageId: pkg.id,
      pageId: brief.facebookPageConfigurationId ?? undefined,
      pageAccessToken: "EAA..."
    });

    expect(record).not.toBeNull();
    expect(mockFacebookAdapter.publish).toHaveBeenCalled();
    expect(campaign.state).toBe("completed");
    expect(publicationRecord).not.toBeNull();
    expect(publicationRecord!.postUrl).toContain("https://www.facebook.com");

    // 7. Deliverable Generation (All 5 Required Artifacts)
    const art1 = generateCampaignBriefDocx(brief);
    const art2 = generateFacebookContentDocx(brief, [contentVersion]);
    const art3 = generateFacebookVisualPng(visualAsset, pngResult.buffer);
    const art4 = generateFacebookPublicationLogXlsx(campaignId, publicationAttempts, publicationRecord);
    const art5 = generateMarketingFinalReportPdf({
      campaign,
      brief,
      content: contentVersion,
      visual: visualAsset,
      pkg,
      record: publicationRecord!,
    });

    const artifacts: MarketingArtifact[] = [
      {
        id: randomUUID(),
        campaignId,
        kind: "campaign_brief_docx",
        filename: art1.filename,
        mediaType: art1.mediaType,
        byteSize: art1.buffer.length,
        sha256Digest: createHash("sha256").update(art1.buffer).digest("hex"),
        storageKey: `marketing/${campaignId}/${art1.filename}`,
        createdAt: now,
      },
      {
        id: randomUUID(),
        campaignId,
        kind: "facebook_content_docx",
        filename: art2.filename,
        mediaType: art2.mediaType,
        byteSize: art2.buffer.length,
        sha256Digest: createHash("sha256").update(art2.buffer).digest("hex"),
        storageKey: `marketing/${campaignId}/${art2.filename}`,
        createdAt: now,
      },
      {
        id: randomUUID(),
        campaignId,
        kind: "facebook_visual_png",
        filename: art3.filename,
        mediaType: art3.mediaType,
        byteSize: art3.buffer.length,
        sha256Digest: createHash("sha256").update(art3.buffer).digest("hex"),
        storageKey: `marketing/${campaignId}/${art3.filename}`,
        createdAt: now,
      },
      {
        id: randomUUID(),
        campaignId,
        kind: "facebook_publication_log_xlsx",
        filename: art4.filename,
        mediaType: art4.mediaType,
        byteSize: art4.buffer.length,
        sha256Digest: createHash("sha256").update(art4.buffer).digest("hex"),
        storageKey: `marketing/${campaignId}/${art4.filename}`,
        createdAt: now,
      },
      {
        id: randomUUID(),
        campaignId,
        kind: "marketing_final_report_pdf",
        filename: art5.filename,
        mediaType: art5.mediaType,
        byteSize: art5.buffer.length,
        sha256Digest: createHash("sha256").update(art5.buffer).digest("hex"),
        storageKey: `marketing/${campaignId}/${art5.filename}`,
        createdAt: now,
      },
    ];

    expect(artifacts).toHaveLength(5);

    // 8. Assert can complete campaign when in reporting state
    const reportingCampaign = { ...campaign, state: "reporting" as const };
    expect(() =>
      assertCanCompleteCampaign({
        campaign: reportingCampaign,
        publicationRecord,
        artifacts,
      }),
    ).not.toThrow();

    expect(campaign.state).toBe("completed");
  });

  it("executes multi-target (Facebook + Instagram simulation) end-to-end publication lifecycle", async () => {
    const campaignId = randomUUID();
    const now = "2026-09-02T10:00:00.000Z";

    const brief: CampaignBrief = {
      id: randomUUID(),
      campaignId,
      campaignName: "Omnichannel NovaPhone Launch",
      objective: "Drive multi-platform awareness on FB & IG",
      subjectKind: "catalog_product",
      subjectReference: "novaphone-15",
      language: "vi",
      mandatoryMessage: "Ưu đãi hấp dẫn trên toàn bộ hệ thống NovaCommerce",
      prohibitedClaims: [],
      callToAction: "Mua ngay",
      facebookPageConfigurationId: "fb-page-main",
      scheduledFor: "2026-09-02T10:00:00.000Z",
      deadline: "2026-09-02T18:00:00.000Z",
      approverId: "approver-1",
      maximumCostMicros: 500000,
      provenance: [],
      version: 1,
      createdAt: now,
    };

    let campaign: MarketingCampaign = {
      id: campaignId,
      state: "scheduled",
      assignmentMode: "direct_department",
      createdBy: "staff-1",
      idempotencyKey: `idemp-multi-${campaignId}`,
      sourceTaskId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const contentVersion: ContentVersion = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      hook: "NovaPhone Ra Mắt",
      body: "Ưu đãi hấp dẫn trên toàn bộ hệ thống NovaCommerce!",
      callToAction: "Mua ngay",
      hashtags: ["#NovaCommerce"],
      visualDirection: "1:1 Square Creative",
      factualClaimSourceIds: [],
      contentDigest: "c".repeat(64),
      costMicros: 0,
      createdAt: now,
    };

    const visualAsset: VisualAsset = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      mediaType: "image/png",
      byteSize: 2048,
      imageDigest: "d".repeat(64),
      altText: "Visual 1:1",
      storageKey: `marketing/${campaignId}/v1.png`,
      costMicros: 0,
      createdAt: now,
    };

    const packageId = randomUUID();
    const fbTargetId = randomUUID();
    const igTargetId = randomUUID();

    const fbTargetDigest = calculatePublicationTargetDigest({
      platform: "facebook",
      format: "feed_image",
      accountConfigurationId: "fb-page-main",
      caption: contentVersion.body,
      mediaAssetIds: [visualAsset.id],
      scheduledFor: brief.scheduledFor,
      executionMode: "live",
    });

    const igTargetDigest = calculatePublicationTargetDigest({
      platform: "instagram",
      format: "feed_image",
      accountConfigurationId: "ig-account-main",
      caption: contentVersion.body,
      mediaAssetIds: [visualAsset.id],
      scheduledFor: brief.scheduledFor,
      executionMode: "simulation",
    });

    const targets: PublicationTarget[] = [
      {
        id: fbTargetId,
        packageId,
        platform: "facebook",
        format: "feed_image",
        accountConfigurationId: "fb-page-main",
        contentVersionId: contentVersion.id,
        mediaAssetIds: [visualAsset.id],
        caption: contentVersion.body,
        scheduledFor: brief.scheduledFor,
        required: true,
        executionMode: "live",
        contentDigest: contentVersion.contentDigest,
        mediaDigest: visualAsset.imageDigest,
        targetDigest: fbTargetDigest,
        status: "approved",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: igTargetId,
        packageId,
        platform: "instagram",
        format: "feed_image",
        accountConfigurationId: "ig-account-main",
        contentVersionId: contentVersion.id,
        mediaAssetIds: [visualAsset.id],
        caption: contentVersion.body,
        scheduledFor: brief.scheduledFor,
        required: false,
        executionMode: "simulation",
        contentDigest: contentVersion.contentDigest,
        mediaDigest: visualAsset.imageDigest,
        targetDigest: igTargetDigest,
        status: "approved",
        createdAt: now,
        updatedAt: now,
      },
    ];

    const packageDigest = calculatePublicationPackageDigest(targets);

    let pkg: PublicationPackage = {
      id: packageId,
      campaignId,
      packageVersion: 1,
      contentVersionId: contentVersion.id,
      visualAssetId: visualAsset.id,
      facebookPageConfigurationId: "fb-page-main",
      scheduledFor: brief.scheduledFor,
      contentDigest: contentVersion.contentDigest,
      imageDigest: visualAsset.imageDigest,
      packageDigest,
      status: "approved",
      targets,
      createdAt: now,
      updatedAt: now,
    };

    const publicationAttempts: PublicationAttempt[] = [];
    const publicationRecords: PublicationRecord[] = [];

    const mockRepo: any = {
      findCampaignById: vi.fn().mockImplementation(async () => campaign),
      findBriefByCampaignId: vi.fn().mockImplementation(async () => brief),
      findPublicationPackageById: vi.fn().mockImplementation(async () => pkg),
      findContentVersionById: vi.fn().mockImplementation(async () => contentVersion),
      findVisualAssetById: vi.fn().mockImplementation(async () => visualAsset),
      findPublicationTargetById: vi.fn().mockImplementation(async (id: string) => targets.find((t) => t.id === id) ?? null),
      findPublicationTargetsByPackageId: vi.fn().mockImplementation(async () => targets),
      claimDuePublicationTargets: vi.fn().mockImplementation(async () => targets),
      updatePublicationTargetStatus: vi.fn().mockImplementation(async ({ targetId, status }: any) => {
        const t = targets.find((x) => x.id === targetId);
        if (t) (t as any).status = status;
        return t;
      }),
      releasePublicationTargetLease: vi.fn().mockResolvedValue(undefined),
      findPublicationRecordByPackageId: vi.fn().mockImplementation(async () => publicationRecords[0] ?? null),
      findPublicationRecordByTargetId: vi.fn().mockImplementation(async (id: string) => publicationRecords.find((r) => r.targetId === id) ?? null),
      findPublicationPackagesByCampaignId: vi.fn().mockImplementation(async () => [pkg]),
      createPublicationAttempt: vi.fn().mockImplementation(async (att) => {
        publicationAttempts.push(att);
        return att;
      }),
      updatePublicationAttempt: vi.fn().mockImplementation(async (id, update) => {
        const index = publicationAttempts.findIndex((a) => a.id === id);
        if (index >= 0) {
          const updated = { ...publicationAttempts[index]!, ...update };
          publicationAttempts[index] = updated;
          return updated;
        }
        return null;
      }),
      createPublicationRecord: vi.fn().mockImplementation(async (rec) => {
        publicationRecords.push(rec);
        return rec;
      }),
      updateCampaignState: vi.fn().mockImplementation(async (_id: string, expectedVersion: number, nextState: any) => {
        campaign = { ...campaign, state: nextState, version: expectedVersion + 1 };
        return campaign;
      }),
      updatePublicationPackageStatus: vi.fn().mockImplementation(async (_id: string, status: any) => {
        pkg = { ...pkg, status };
        return pkg;
      }),
    };

    const mockFacebookAdapter: SocialPublisherPort = {
      platform: "facebook",
      executionMode: "live",
      publish: vi.fn().mockResolvedValue({
        platform: "facebook",
        pageId: "fb-page-main",
        externalPublicationId: "fb-post-9988",
        publicationUrl: "https://www.facebook.com/fb-page-main/posts/9988",
        executionMode: "live",
        simulated: false,
        displayMessage: "Published to Facebook successfully",
        providerReceiptDigest: "fb-receipt-123",
        verifiedAt: now,
      }),
      reconcile: vi.fn().mockResolvedValue({ exists: true }),
    };

    const fakeInstagramAdapter = new FakeInstagramPublisherAdapter();

    const registry = new SocialPublisherRegistry();
    registry.register(mockFacebookAdapter as any);
    registry.register(fakeInstagramAdapter);

    const publisherService = new MarketingPublisherServiceImpl({
      marketingRepository: mockRepo,
      publisherRegistry: registry,
      assetStorageReader: async () => Buffer.from("dummy-png-bytes"),
      now: () => now,
    });

    const results = await publisherService.publishDueTargets({
      workerId: "test-worker-1",
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.platform).toBe("facebook");
    expect(results[0]?.simulated).toBe(false);
    expect(results[1]?.platform).toBe("instagram");
    expect(results[1]?.simulated).toBe(true);

    expect(targets[0]?.status).toBe("verified");
    expect(targets[1]?.status).toBe("verified");
    expect(campaign.state).toBe("completed");
  });

  it("handles partial failure when optional Instagram target fails while required Facebook target succeeds", async () => {
    const campaignId = randomUUID();
    const now = "2026-09-02T10:00:00.000Z";

    const brief: CampaignBrief = {
      id: randomUUID(),
      campaignId,
      campaignName: "Partial Failure Test",
      objective: "Test resilience when optional channel fails",
      subjectKind: "catalog_product",
      subjectReference: "novaphone-15",
      language: "vi",
      mandatoryMessage: "Thong diep",
      prohibitedClaims: [],
      callToAction: "Mua ngay",
      facebookPageConfigurationId: "fb-page-main",
      scheduledFor: "2026-09-02T10:00:00.000Z",
      deadline: "2026-09-02T18:00:00.000Z",
      approverId: "approver-1",
      maximumCostMicros: 500000,
      provenance: [],
      version: 1,
      createdAt: now,
    };

    let campaign: MarketingCampaign = {
      id: campaignId,
      state: "scheduled",
      assignmentMode: "direct_department",
      createdBy: "staff-1",
      idempotencyKey: `idemp-pf-${campaignId}`,
      sourceTaskId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const contentVersion: ContentVersion = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      hook: "Test hook",
      body: "Test content",
      callToAction: "Mua ngay",
      hashtags: [],
      visualDirection: "1:1 Square Creative",
      factualClaimSourceIds: [],
      contentDigest: "c".repeat(64),
      costMicros: 0,
      createdAt: now,
    };

    const visualAsset: VisualAsset = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      mediaType: "image/png",
      byteSize: 2048,
      imageDigest: "d".repeat(64),
      altText: "Visual 1:1 Alt",
      storageKey: `marketing/${campaignId}/v1.png`,
      costMicros: 0,
      createdAt: now,
    };

    const packageId = randomUUID();
    const fbTargetId = randomUUID();
    const igTargetId = randomUUID();

    const fbTargetDigest = calculatePublicationTargetDigest({
      platform: "facebook",
      format: "feed_image",
      accountConfigurationId: "fb-page-main",
      caption: contentVersion.body,
      mediaAssetIds: [visualAsset.id],
      scheduledFor: brief.scheduledFor,
      executionMode: "live",
    });

    const igTargetDigest = calculatePublicationTargetDigest({
      platform: "instagram",
      format: "feed_image",
      accountConfigurationId: "ig-account-main",
      caption: contentVersion.body,
      mediaAssetIds: [visualAsset.id],
      scheduledFor: brief.scheduledFor,
      executionMode: "live",
    });

    const targets: PublicationTarget[] = [
      {
        id: fbTargetId,
        packageId,
        platform: "facebook",
        format: "feed_image",
        accountConfigurationId: "fb-page-main",
        contentVersionId: contentVersion.id,
        mediaAssetIds: [visualAsset.id],
        caption: contentVersion.body,
        scheduledFor: brief.scheduledFor,
        required: true,
        executionMode: "live",
        contentDigest: contentVersion.contentDigest,
        mediaDigest: visualAsset.imageDigest,
        targetDigest: fbTargetDigest,
        status: "approved",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: igTargetId,
        packageId,
        platform: "instagram",
        format: "feed_image",
        accountConfigurationId: "ig-account-main",
        contentVersionId: contentVersion.id,
        mediaAssetIds: [visualAsset.id],
        caption: contentVersion.body,
        scheduledFor: brief.scheduledFor,
        required: false,
        executionMode: "live",
        contentDigest: contentVersion.contentDigest,
        mediaDigest: visualAsset.imageDigest,
        targetDigest: igTargetDigest,
        status: "approved",
        createdAt: now,
        updatedAt: now,
      },
    ];

    const packageDigest = calculatePublicationPackageDigest(targets);

    let pkg: PublicationPackage = {
      id: packageId,
      campaignId,
      packageVersion: 1,
      contentVersionId: contentVersion.id,
      visualAssetId: visualAsset.id,
      facebookPageConfigurationId: "fb-page-main",
      scheduledFor: brief.scheduledFor,
      contentDigest: contentVersion.contentDigest,
      imageDigest: visualAsset.imageDigest,
      packageDigest,
      status: "approved",
      targets,
      createdAt: now,
      updatedAt: now,
    };

    const publicationAttempts: PublicationAttempt[] = [];
    const publicationRecords: PublicationRecord[] = [];

    const mockRepo: any = {
      findCampaignById: vi.fn().mockImplementation(async () => campaign),
      findBriefByCampaignId: vi.fn().mockImplementation(async () => brief),
      findPublicationPackageById: vi.fn().mockImplementation(async () => pkg),
      findContentVersionById: vi.fn().mockImplementation(async () => contentVersion),
      findVisualAssetById: vi.fn().mockImplementation(async () => visualAsset),
      findPublicationTargetById: vi.fn().mockImplementation(async (id: string) => targets.find((t) => t.id === id) ?? null),
      findPublicationTargetsByPackageId: vi.fn().mockImplementation(async () => targets),
      claimDuePublicationTargets: vi.fn().mockImplementation(async () => targets),
      updatePublicationTargetStatus: vi.fn().mockImplementation(async ({ targetId, status }: any) => {
        const t = targets.find((x) => x.id === targetId);
        if (t) (t as any).status = status;
        return t;
      }),
      releasePublicationTargetLease: vi.fn().mockResolvedValue(undefined),
      findPublicationRecordByPackageId: vi.fn().mockImplementation(async () => publicationRecords[0] ?? null),
      findPublicationRecordByTargetId: vi.fn().mockImplementation(async (id: string) => publicationRecords.find((r) => r.targetId === id) ?? null),
      findPublicationPackagesByCampaignId: vi.fn().mockImplementation(async () => [pkg]),
      createPublicationAttempt: vi.fn().mockImplementation(async (att) => {
        publicationAttempts.push(att);
        return att;
      }),
      updatePublicationAttempt: vi.fn().mockImplementation(async (id, update) => {
        const index = publicationAttempts.findIndex((a) => a.id === id);
        if (index >= 0) {
          const updated = { ...publicationAttempts[index]!, ...update };
          publicationAttempts[index] = updated;
          return updated;
        }
        return null;
      }),
      createPublicationRecord: vi.fn().mockImplementation(async (rec) => {
        publicationRecords.push(rec);
        return rec;
      }),
      updateCampaignState: vi.fn().mockImplementation(async (_id: string, expectedVersion: number, nextState: any) => {
        campaign = { ...campaign, state: nextState, version: expectedVersion + 1 };
        return campaign;
      }),
      updatePublicationPackageStatus: vi.fn().mockImplementation(async (_id: string, status: any) => {
        pkg = { ...pkg, status };
        return pkg;
      }),
    };

    const mockFacebookAdapter: SocialPublisherPort = {
      platform: "facebook",
      executionMode: "live",
      publish: vi.fn().mockResolvedValue({
        platform: "facebook",
        pageId: "fb-page-main",
        externalPublicationId: "fb-post-9988",
        publicationUrl: "https://www.facebook.com/fb-page-main/posts/9988",
        executionMode: "live",
        simulated: false,
        displayMessage: "Published to Facebook successfully",
        providerReceiptDigest: "fb-receipt-123",
        verifiedAt: now,
      }),
      reconcile: vi.fn().mockResolvedValue({ exists: true }),
    };

    const failingInstagramAdapter: SocialPublisherPort = {
      platform: "instagram",
      executionMode: "live",
      publish: vi.fn().mockRejectedValue(new Error("Instagram API network timeout")),
      reconcile: vi.fn().mockResolvedValue({ exists: false }),
    };

    const registry = new SocialPublisherRegistry();
    registry.register(mockFacebookAdapter as any);
    registry.register(failingInstagramAdapter as any);

    const publisherService = new MarketingPublisherServiceImpl({
      marketingRepository: mockRepo,
      publisherRegistry: registry,
      assetStorageReader: async () => Buffer.from("dummy-png-bytes"),
      now: () => now,
    });

    const results = await publisherService.publishDueTargets({
      workerId: "test-worker-1",
    });

    expect(results).toHaveLength(1);
    expect(targets[0]?.status).toBe("verified");
    expect(targets[1]?.status).toBe("failed");
    expect(campaign.state).toBe("partial_failure");
  });
});
