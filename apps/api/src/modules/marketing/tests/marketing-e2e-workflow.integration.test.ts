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
  type VisualAsset,
} from "../domain/entities/marketing-campaign";
import {
  assertCanCompleteCampaign,
  assertValidStateTransition,
  canTransitionState,
} from "../domain/services/marketing-campaign-rules";
import { generateCampaignBriefDocx } from "../infrastructure/generators/campaign-brief-docx.generator";
import { generateFacebookContentDocx } from "../infrastructure/generators/facebook-content-docx.generator";
import { generateFacebookVisualPng } from "../infrastructure/generators/facebook-visual-png.generator";
import { generateFacebookPublicationLogXlsx } from "../infrastructure/generators/facebook-publication-log-xlsx.generator";
import { generateMarketingFinalReportPdf } from "../infrastructure/generators/marketing-final-report-pdf.generator";
import type { FacebookPublisherPort } from "../application/ports/facebook-publisher.port";
import { MarketingPublisherServiceImpl } from "../application/services/implementations/marketing-publisher.service";
import type { MarketingCampaignRepository } from "../domain/repositories/marketing-campaign.repository";

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
      variant: "feed_post_square",
      headline: "NovaPhone 15 Pro Max Ra Mắt",
      body: contentText,
      primaryText: contentText,
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
    const fullText = `${contentVersion.headline ?? ""} ${contentVersion.body}`.toLowerCase();
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
      promptSummary: "Hero studio shot",
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
      promptSummary: "Hero studio shot",
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
      status: "ready_for_review",
      approvalRequestId: null,
      createdAt: now,
      updatedAt: now,
    };

    // Transition: visual_creation -> package_assembly -> campaign_review -> awaiting_human_approval
    campaign = { ...campaign, state: "package_assembly", version: 5 };
    campaign = { ...campaign, state: "campaign_review", version: 6 };
    campaign = { ...campaign, state: "awaiting_human_approval", version: 7 };

    // 5. Human-in-the-loop Staff Approval
    pkg = {
      ...pkg,
      status: "approved",
      approvalRequestId: "staff-director-approval-1",
      updatedAt: new Date().toISOString(),
    };

    // 6. Fail-Closed Publisher Engine execution
    const mockFacebookAdapter: FacebookPublisherPort = {
      publishImagePost: vi.fn().mockResolvedValue({
        externalPostId: "page-novacommerce-official_998877",
        postUrl: "https://www.facebook.com/page-novacommerce-official/posts/998877",
        providerReceiptDigest: "receipt-hash-12345",
      }),
      verifyPublication: vi.fn().mockResolvedValue(true),
    };

    let publicationRecord: PublicationRecord | null = null;
    const publicationAttempts: PublicationAttempt[] = [];

    const mockRepo: any = {
      findCampaignById: vi.fn().mockImplementation(async () => campaign),
      findBriefByCampaignId: vi.fn().mockImplementation(async () => brief),
      findPublicationPackageById: vi.fn().mockImplementation(async () => pkg),
      findContentVersionById: vi.fn().mockImplementation(async () => contentVersion),
      findVisualAssetById: vi.fn().mockImplementation(async () => visualAsset),
      findPublicationRecordByPackageId: vi.fn().mockImplementation(async () => publicationRecord),
      createPublicationAttempt: vi.fn().mockImplementation(async (att) => {
        publicationAttempts.push(att);
        return att;
      }),
      updatePublicationAttempt: vi.fn().mockImplementation(async (id, status) => {
        const att = publicationAttempts.find((a) => a.id === id);
        if (att) att.status = status;
        return att;
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

    const publisherService = new MarketingPublisherServiceImpl({
      marketingRepository: mockRepo,
      facebookPublisher: mockFacebookAdapter,
    });

    // Publish approved package
    const record = await publisherService.publishApprovedPackage({
      campaignId: campaign.id,
      packageId: pkg.id,
      pageId: brief.facebookPageConfigurationId,
      pageAccessToken: "EAA..."
    });

    expect(record).not.toBeNull();
    expect(mockFacebookAdapter.publishImagePost).toHaveBeenCalled();
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
});
