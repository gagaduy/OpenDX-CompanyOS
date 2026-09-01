// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import type {
  CampaignBrief,
  ContentVersion,
  MarketingCampaign,
  PublicationPackage,
  PublicationTarget,
  VisualAsset,
} from "../../../domain/entities/marketing-campaign";
import {
  assertValidStateTransition,
  canTransitionState,
} from "../../../domain/services/marketing-campaign-rules";
import {
  assertFormatEnabled,
  calculatePublicationPackageDigest,
  calculatePublicationTargetDigest,
} from "../../../domain/services/marketing-publication-policy";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import type {
  CreateMarketingCampaignInput,
  MarketingCampaignDetailResponseDto,
  MarketingCampaignListResponseDto,
  MarketingCampaignResponseDto,
} from "../../dtos/marketing.dto";
import type { IMarketingCampaignService } from "../interfaces/marketing-campaign.service";
import { MarketingApplicationError } from "../../../presentation/middleware/marketing-error.middleware";

const OUT_OF_SCOPE_PATTERNS = [
  /\bpaid\s*ads?\b/i,
  /\bgoogle\s*ads?\b/i,
  /\btiktok\b/i,
  /\blinkedin\b/i,
  /\brecurring\s*schedule\b/i,
  /\bcomment\s*reply\b/i,
  /\be-?invoice\b/i,
  /\bshipping\s*provider\b/i,
];

const CROSS_DEPARTMENT_PATTERNS = [
  /\binventory\s*adjustment\b/i,
  /\bcreate\s*voucher\b/i,
  /\brefund\s*order\b/i,
  /\bcharge\s*card\b/i,
  /\bupdate\s*price\b/i,
  /\bwarehouse\b/i,
];

export interface MarketingCampaignServiceOptions {
  readonly repository: MarketingRepository;
  readonly materializeVisualAsset?: (
    input: MaterializeMarketingVisualAssetInput,
  ) => Promise<MaterializedMarketingVisualAsset>;
  readonly generateId?: () => string;
  readonly now?: () => string;
}

export interface MaterializeMarketingVisualAssetInput {
  readonly campaignId: string;
  readonly versionNumber: number;
  readonly storageKey: string;
  readonly mediaType: "image/png";
  readonly width: number;
  readonly height: number;
  readonly altText: string;
}

export interface MaterializedMarketingVisualAsset {
  readonly byteSize: number;
  readonly imageDigest: string;
}

export class MarketingCampaignService implements IMarketingCampaignService {
  private readonly repository: MarketingRepository;
  private readonly materializeVisualAsset?: MarketingCampaignServiceOptions["materializeVisualAsset"];
  private readonly generateId: () => string;
  private readonly now: () => string;

  constructor(options: MarketingCampaignServiceOptions) {
    this.repository = options.repository;
    this.materializeVisualAsset = options.materializeVisualAsset;
    this.generateId = options.generateId ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createCampaign(
    actorId: string,
    input: CreateMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto> {
    const currentTime = this.now();

    // 1. Scope and cross-department validation
    const combinedText = `${input.campaignName} ${input.objective} ${input.mandatoryMessage}`;
    for (const pattern of OUT_OF_SCOPE_PATTERNS) {
      if (pattern.test(combinedText)) {
        throw MarketingApplicationError.outOfScope(
          "Marketing scope is strictly limited to Facebook and Instagram publication.",
        );
      }
    }

    for (const pattern of CROSS_DEPARTMENT_PATTERNS) {
      if (pattern.test(combinedText)) {
        throw MarketingApplicationError.crossDepartmentCoordinationRequired(
          "Work requires coordination with another department and cannot be executed solely by Marketing.",
        );
      }
    }

    // 2. Required fields check
    if (
      !input.subject?.reference ||
      !input.facebookPageConfigurationId ||
      !input.scheduledFor ||
      !input.approverId
    ) {
      throw MarketingApplicationError.waitingForInput("Missing required brief subject, page, schedule, or approver.");
    }

    // 3. Timestamps validation
    const scheduledTime = new Date(input.scheduledFor).getTime();
    const deadlineTime = new Date(input.deadline).getTime();
    const currentEpoch = new Date(currentTime).getTime();

    if (scheduledTime <= currentEpoch) {
      throw new MarketingApplicationError(
        400,
        "INVALID_SCHEDULED_TIME",
        "Scheduled time must be strictly in the future.",
      );
    }

    if (deadlineTime < scheduledTime) {
      throw new MarketingApplicationError(
        400,
        "INVALID_DEADLINE",
        "Deadline must be at or after the scheduled publication time.",
      );
    }

    // 4. Check idempotency
    const existing = await this.repository.findCampaignByIdempotencyKey(
      actorId,
      input.idempotencyKey,
    );

    if (existing) {
      const existingBrief = await this.repository.findBriefByCampaignId(existing.id);
      if (existingBrief) {
        const isMatch =
          existingBrief.campaignName === input.campaignName &&
          existingBrief.objective === input.objective &&
          existingBrief.subjectKind === input.subject.kind &&
          existingBrief.subjectReference === input.subject.reference &&
          existingBrief.facebookPageConfigurationId === input.facebookPageConfigurationId &&
          existingBrief.language === input.language;

        if (isMatch) {
          return this.toCampaignDto(existing);
        }
        throw MarketingApplicationError.idempotencyConflict(input.idempotencyKey);
      }
    }

    // 5. Create Campaign & Brief
    const campaignId = this.generateId();
    const briefId = this.generateId();

    const campaign: MarketingCampaign = {
      id: campaignId,
      state: "draft",
      assignmentMode: input.assignmentMode ?? "direct_department",
      createdBy: actorId,
      idempotencyKey: input.idempotencyKey,
      sourceTaskId: input.sourceTaskId ?? null,
      version: 1,
      createdAt: currentTime,
      updatedAt: currentTime,
    };

    const brief: CampaignBrief = {
      id: briefId,
      campaignId,
      campaignName: input.campaignName,
      objective: input.objective,
      subjectKind: input.subject.kind,
      subjectReference: input.subject.reference,
      audience: input.audience ?? null,
      language: input.language,
      tone: input.tone ?? null,
      mandatoryMessage: input.mandatoryMessage,
      prohibitedClaims: input.prohibitedClaims,
      callToAction: input.callToAction,
      facebookPageConfigurationId: input.facebookPageConfigurationId,
      scheduledFor: input.scheduledFor,
      deadline: input.deadline,
      approverId: input.approverId,
      maximumCostMicros: input.maximumCostMicros,
      provenance: input.provenance,
      version: 1,
      createdAt: currentTime,
    };

    const saved = await this.repository.createCampaign(campaign, brief);
    return this.toCampaignDto(saved);
  }

  async getCampaign(id: string): Promise<MarketingCampaignDetailResponseDto> {
    const campaign = await this.repository.findCampaignById(id);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(id);
    }

    const [
      brief,
      contentVersions,
      visualAssets,
      publicationPackages,
      currentPackage,
      artifacts,
    ] = await Promise.all([
      this.repository.findBriefByCampaignId(id),
      this.repository.findContentVersionsByCampaignId(id),
      this.repository.findVisualAssetsByCampaignId(id),
      this.repository.findPublicationPackagesByCampaignId(id),
      this.repository.findCurrentPackageByCampaignId(id),
      this.repository.findArtifactsByCampaignId(id),
    ]);

    let attempts: readonly import("../../../domain/entities/marketing-campaign").PublicationAttempt[] = [];
    let publicationRecord: import("../../../domain/entities/marketing-campaign").PublicationRecord | null = null;
    let targets: readonly PublicationTarget[] = [];

    if (currentPackage) {
      [attempts, publicationRecord, targets] = await Promise.all([
        this.repository.findPublicationAttemptsByPackageId(currentPackage.id),
        this.repository.findPublicationRecordByPackageId(currentPackage.id),
        this.repository.findPublicationTargetsByPackageId(currentPackage.id),
      ]);
      (currentPackage as any).targets = targets;
    }

    return {
      campaign: this.toCampaignDto(campaign),
      brief,
      contentVersions,
      visualAssets,
      publicationPackages,
      currentPackage,
      publicationAttempts: attempts,
      publicationRecord,
      artifacts,
    };
  }

  async listCampaigns(params?: {
    limit?: number;
    offset?: number;
  }): Promise<MarketingCampaignListResponseDto> {
    const items = await this.repository.listCampaigns(params);
    return {
      items: items.map(this.toCampaignDto),
      total: items.length,
    };
  }

  async markReady(
    _actorId: string,
    campaignId: string,
  ): Promise<MarketingCampaignResponseDto> {
    const campaign = await this.repository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    assertValidStateTransition(campaign.state, "validating");

    const updated = await this.repository.updateCampaignState(
      campaignId,
      campaign.version,
      "validating",
    );
    return this.toCampaignDto(updated);
  }

  async cancelCampaign(
    _actorId: string,
    campaignId: string,
    _reason?: string,
  ): Promise<MarketingCampaignResponseDto> {
    const campaign = await this.repository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    if (!canTransitionState(campaign.state, "canceled")) {
      throw MarketingApplicationError.invalidStateTransition(
        `Cannot cancel marketing campaign in state '${campaign.state}'.`,
      );
    }

    const updated = await this.repository.updateCampaignState(
      campaignId,
      campaign.version,
      "canceled",
    );
    return this.toCampaignDto(updated);
  }

  async approveCampaign(
    actorId: string,
    campaignId: string,
    input: import("../../dtos/marketing.dto").ApproveMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto> {
    const campaign = await this.repository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    const currentPackage = await this.repository.findCurrentPackageByCampaignId(campaignId);
    if (!currentPackage) {
      throw MarketingApplicationError.packageNotFound(campaignId);
    }

    const targets = await this.repository.findPublicationTargetsByPackageId(currentPackage.id);

    if (input.decision === "approve") {
      for (const target of targets) {
        await this.repository.updatePublicationTargetStatus({
          targetId: target.id,
          status: "approved",
        });
      }
      await this.repository.updatePublicationPackageStatus(currentPackage.id, "approved", actorId);
      if (campaign.state !== "awaiting_human_approval" && canTransitionState(campaign.state, "awaiting_human_approval")) {
        await this.repository.updateCampaignState(campaign.id, campaign.version, "awaiting_human_approval");
      }
    } else {
      for (const target of targets) {
        await this.repository.updatePublicationTargetStatus({
          targetId: target.id,
          status: "failed",
        });
      }
      await this.repository.updatePublicationPackageStatus(currentPackage.id, "rejected", actorId);
      if (canTransitionState(campaign.state, "revision_requested")) {
        await this.repository.updateCampaignState(campaign.id, campaign.version, "revision_requested");
      }
    }

    const updated = await this.repository.findCampaignById(campaignId);
    return this.toCampaignDto(updated ?? campaign);
  }

  async requestRevision(
    _actorId: string,
    campaignId: string,
    input: import("../../dtos/marketing.dto").RequestRevisionMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto> {
    const campaign = await this.repository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    if (!canTransitionState(campaign.state, "revision_requested")) {
      throw MarketingApplicationError.invalidStateTransition(
        `Cannot request revision for marketing campaign in state '${campaign.state}'.`,
      );
    }

    // Step 1: Mark revision requested
    const step1 = await this.repository.updateCampaignState(
      campaignId,
      campaign.version,
      "revision_requested",
    );

    // Step 2: Transition to content_drafting
    const step2 = await this.repository.updateCampaignState(
      campaignId,
      step1.version,
      "content_drafting",
    );

    const [brief, existingContents, existingVisuals, existingPackages] = await Promise.all([
      this.repository.findBriefByCampaignId(campaignId),
      this.repository.findContentVersionsByCampaignId(campaignId),
      this.repository.findVisualAssetsByCampaignId(campaignId),
      this.repository.findPublicationPackagesByCampaignId(campaignId),
    ]);

    const newVersionNumber = existingContents.length + 1;
    const now = new Date().toISOString();

    // AI Copywriter: Generate creative Content Version via OpenRouter Gemini LLM
    const feedbackNote = (input.feedback ?? "").trim();
    let hook = `🔥 [Cập nhật v${newVersionNumber}] ${brief?.campaignName ?? "Ưu Đãi Đặc Biệt"}`;
    let body = `${brief?.mandatoryMessage ?? ""}\n\n📌 Ghi chú điều chỉnh: ${feedbackNote}\n✨ Đừng bỏ lỡ cơ hội sở hữu ngay hôm nay với mức giá ưu đãi nhất tại NovaCommerce Store!`;
    let callToAction = brief?.callToAction ?? "Đặt hàng ngay";
    let hashtags = ["#NovaCommerce", "#UuDai", "#FlashSale"];

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (apiKey && process.env.OPENROUTER_EXECUTION_ENABLED === "true") {
      try {
        const prompt = `Bạn là một Cây bút Tiếp thị (Copywriter) hàng đầu cho nền tảng thương mại điện tử NovaCommerce.
Hãy sáng tạo một bài đăng Facebook bán hàng chuyên nghiệp, hấp dẫn, có cảm xúc cho chiến dịch sau:
- Tên chiến dịch: ${brief?.campaignName ?? "Chiến dịch tiếp thị"}
- Thông điệp / Yêu cầu người dùng: ${brief?.mandatoryMessage ?? ""}
- Lời kêu gọi hành động: ${brief?.callToAction ?? "Mua ngay"}
${feedbackNote ? `- Ghi chú phản hồi / Yêu cầu sửa đổi: ${feedbackNote}` : ""}

Yêu cầu trả về đúng định dạng JSON không bọc markdown theo cấu trúc:
{
  "hook": "Tiêu đề giật tít hấp dẫn có icon và tên sản phẩm (1 dòng)",
  "body": "Nội dung bài viết Facebook đầy đủ, hấp dẫn, chia đoạn rõ lượng với emoji, nêu bật lợi ích và quà tặng",
  "callToAction": "Lời kêu gọi hành động",
  "hashtags": ["#NovaCommerce", "#TenSanPham", "#UuDai"]
}`;

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.MARKETING_CONTENT_MODELS || "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          const contentStr = data.choices?.[0]?.message?.content;
          if (contentStr) {
            const parsed = JSON.parse(contentStr);
            if (parsed.hook) hook = parsed.hook;
            if (parsed.body) body = parsed.body;
            if (parsed.callToAction) callToAction = parsed.callToAction;
            if (Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0) hashtags = parsed.hashtags;
          }
        }
      } catch (err) {
        console.error("OpenRouter LLM copy generation failed, using fallback:", err);
      }
    }

    const contentDigest = createHash("sha256")
      .update(`${hook}\n${body}\n${callToAction}\n${hashtags.join(",")}`)
      .digest("hex");

    const newContentId = this.generateId();
    const newContent: ContentVersion = {
      id: newContentId,
      campaignId,
      versionNumber: newVersionNumber,
      hook,
      body,
      callToAction,
      hashtags,
      visualDirection: `1:1 Square Creative adjusted for: ${feedbackNote}`,
      factualClaimSourceIds: [],
      contentDigest,
      costMicros: 0,
      createdAt: now,
    };
    await this.repository.createContentVersion(newContent);

    // Step 3: Transition to visual_creation
    const step3 = await this.repository.updateCampaignState(
      campaignId,
      step2.version,
      "visual_creation",
    );

    // AI Designer: Generate revised Visual Asset
    const newVisualId = this.generateId();
    if (!this.materializeVisualAsset) {
      throw MarketingApplicationError.assetStorageUnavailable();
    }
    const storageKey = `marketing/${campaignId}/visual_v${newVersionNumber}.png`;
    const altText = `Hình ảnh chiến dịch v${newVersionNumber} - ${brief?.campaignName ?? "NovaCommerce"}`;
    const materializedVisual = await this.materializeVisualAsset({
      campaignId,
      versionNumber: newVersionNumber,
      storageKey,
      mediaType: "image/png",
      width: 1080,
      height: 1080,
      altText,
    });

    const newVisual: VisualAsset = {
      id: newVisualId,
      campaignId,
      versionNumber: newVersionNumber,
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      mediaType: "image/png",
      byteSize: materializedVisual.byteSize,
      imageDigest: materializedVisual.imageDigest,
      storageKey,
      altText,
      costMicros: 0,
      createdAt: now,
    };
    await this.repository.createVisualAsset(newVisual);

    // Step 4: Transition to campaign_review
    const step4 = await this.repository.updateCampaignState(
      campaignId,
      step3.version,
      "campaign_review",
    );

    // Step 5: Assemble Publication Package with multi-target support
    const newPackageId = this.generateId();

    const fbTargetId = this.generateId();
    const fbTargetDigest = calculatePublicationTargetDigest({
      platform: "facebook",
      format: "feed_image",
      accountConfigurationId: brief?.facebookPageConfigurationId ?? "fb_page_novacommerce_main",
      caption: newContent.body,
      mediaAssetIds: [newVisualId],
      scheduledFor: brief?.scheduledFor ?? now,
      executionMode: "live",
    });

    const fbTarget: PublicationTarget = {
      id: fbTargetId,
      packageId: newPackageId,
      platform: "facebook",
      format: "feed_image",
      accountConfigurationId: brief?.facebookPageConfigurationId ?? "fb_page_novacommerce_main",
      contentVersionId: newContentId,
      mediaAssetIds: [newVisualId],
      caption: newContent.body,
      scheduledFor: brief?.scheduledFor ?? now,
      required: true,
      executionMode: "live",
      contentDigest,
      mediaDigest: materializedVisual.imageDigest,
      targetDigest: fbTargetDigest,
      status: "pending_approval",
      createdAt: now,
      updatedAt: now,
    };

    const igTargetId = this.generateId();
    const igTargetDigest = calculatePublicationTargetDigest({
      platform: "instagram",
      format: "feed_image",
      accountConfigurationId: "instagram-default",
      caption: newContent.body,
      mediaAssetIds: [newVisualId],
      scheduledFor: brief?.scheduledFor ?? now,
      executionMode: "simulation",
    });

    const igTarget: PublicationTarget = {
      id: igTargetId,
      packageId: newPackageId,
      platform: "instagram",
      format: "feed_image",
      accountConfigurationId: "instagram-default",
      contentVersionId: newContentId,
      mediaAssetIds: [newVisualId],
      caption: newContent.body,
      scheduledFor: brief?.scheduledFor ?? now,
      required: false,
      executionMode: "simulation",
      contentDigest,
      mediaDigest: materializedVisual.imageDigest,
      targetDigest: igTargetDigest,
      status: "pending_approval",
      createdAt: now,
      updatedAt: now,
    };

    assertFormatEnabled("facebook", "feed_image");
    assertFormatEnabled("instagram", "feed_image");

    const targets = [fbTarget, igTarget];
    const packageDigest = calculatePublicationPackageDigest(targets);

    const newPackage: PublicationPackage = {
      id: newPackageId,
      campaignId,
      packageVersion: existingPackages.length + 1,
      contentVersionId: newContentId,
      visualAssetId: newVisualId,
      facebookPageConfigurationId: brief?.facebookPageConfigurationId ?? "fb_page_novacommerce_main",
      scheduledFor: brief?.scheduledFor ?? now,
      contentDigest,
      imageDigest: materializedVisual.imageDigest,
      packageDigest,
      status: "draft",
      approvalRequestId: null,
      targets,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.createPublicationPackage(newPackage);
    await this.repository.createPublicationTargets(targets);

    // Step 6: Advance state to awaiting_human_approval so Admin can review and publish!
    const step5 = await this.repository.updateCampaignState(
      campaignId,
      step4.version,
      "awaiting_human_approval",
    );

    return this.toCampaignDto(step5);
  }

  async qualityFeedback(
    _actorId: string,
    campaignId: string,
    input: import("../../dtos/marketing.dto").QualityFeedbackMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto> {
    const campaign = await this.repository.findCampaignById(campaignId);
    if (!campaign) {
      throw MarketingApplicationError.campaignNotFound(campaignId);
    }

    if (input.status === "escalated") {
      if (!canTransitionState(campaign.state, "quality_escalated")) {
        throw MarketingApplicationError.invalidStateTransition(
          `Cannot escalate marketing campaign in state '${campaign.state}'.`,
        );
      }
      const updated = await this.repository.updateCampaignState(
        campaignId,
        campaign.version,
        "quality_escalated",
      );
      return this.toCampaignDto(updated);
    }

    return this.toCampaignDto(campaign);
  }

  private toCampaignDto(campaign: MarketingCampaign): MarketingCampaignResponseDto {
    return {
      id: campaign.id,
      state: campaign.state,
      assignmentMode: campaign.assignmentMode,
      createdBy: campaign.createdBy,
      idempotencyKey: campaign.idempotencyKey,
      sourceTaskId: campaign.sourceTaskId ?? null,
      campaignName: (campaign as any).campaignName ?? null,
      objective: (campaign as any).objective ?? null,
      mandatoryMessage: (campaign as any).mandatoryMessage ?? null,
      version: campaign.version,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
