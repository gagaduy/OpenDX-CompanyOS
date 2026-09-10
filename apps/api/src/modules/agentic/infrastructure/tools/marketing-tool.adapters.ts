// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import type { DepartmentToolAdapter, DepartmentToolExecutionContext } from "../../application/services/interfaces/department-tool-adapter";
import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import { departmentToolResult, unavailable } from "./department-tool-result.factory";
import type { MarketingRepository } from "../../../marketing/application/repositories/interfaces/marketing.repository";
import type { ContentVersion, PublicationPackage, VisualAsset } from "../../../marketing/domain/entities/marketing-campaign";
import { canTransitionState, validatePng1x1Square } from "../../../marketing/domain/services/marketing-campaign-rules";

export interface CatalogProductReader {
  findProductSummary(productId: string): Promise<{
    id: string;
    title: string;
    slug: string;
    description: string | null;
    defaultPriceVnd: number | null;
    primaryImageUrl: string | null;
    isPublished: boolean;
    variantCount: number;
  } | null>;
}

export interface MarketingDepartmentToolAdapterOptions {
  readonly marketingRepository: MarketingRepository;
  readonly catalogReader?: CatalogProductReader;
  readonly now?: () => string;
  readonly generateId?: () => string;
}

export class MarketingDepartmentToolAdapter implements DepartmentToolAdapter {
  private readonly marketingRepository: MarketingRepository;
  private readonly catalogReader?: CatalogProductReader;
  private readonly now: () => string;
  private readonly generateId: () => string;

  constructor(options: MarketingDepartmentToolAdapterOptions) {
    this.marketingRepository = options.marketingRepository;
    this.catalogReader = options.catalogReader;
    this.now = options.now ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? randomUUID;
  }

  async execute(
    context: DepartmentToolExecutionContext,
    parameters: Readonly<Record<string, unknown>>,
  ) {
    const name = context.toolName;
    const kind = context.agentKind;

    if (name === "marketing.fetch_campaign_brief") {
      if (kind !== "marketing_content" && kind !== "marketing_visual" && kind !== "marketing_publisher") {
        return unavailable();
      }
      const campaignId = parameters.campaign_id as string;
      const brief = await this.marketingRepository.findBriefByCampaignId(campaignId);
      if (!brief) {
        throw new AgenticApplicationError("CAMPAIGN_NOT_FOUND", `Campaign brief not found for campaign ${campaignId}`);
      }

      const summary = {
        campaign_id: brief.campaignId,
        campaign_name: brief.campaignName,
        objective: brief.objective,
        subject: {
          kind: brief.subjectKind,
          reference: brief.subjectReference,
        },
        audience: brief.audience,
        language: brief.language,
        tone: brief.tone,
        mandatory_message: brief.mandatoryMessage,
        prohibited_claims: [...brief.prohibitedClaims],
        call_to_action: brief.callToAction,
        facebook_page_configuration_id: brief.facebookPageConfigurationId,
        scheduled_for: brief.scheduledFor,
        deadline: brief.deadline,
        approver_id: brief.approverId,
        maximum_cost_micros: brief.maximumCostMicros,
        provenance: brief.provenance.map((p) => ({
          sourceType: p.sourceType,
          sourceId: p.sourceId,
          sourceDigest: p.sourceDigest,
          classification: p.classification,
        })),
      };

      return departmentToolResult(name, context, parameters, this.now, summary);
    }

    if (name === "marketing.fetch_catalog_product_summary") {
      if (kind !== "marketing_content" && kind !== "marketing_visual") {
        return unavailable();
      }
      const productId = parameters.product_id as string;
      const product = this.catalogReader ? await this.catalogReader.findProductSummary(productId) : null;
      if (!product) {
        throw new AgenticApplicationError("PRODUCT_NOT_FOUND", `Product summary not found for ${productId}`);
      }

      const summary = {
        product_id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        default_price_vnd: product.defaultPriceVnd,
        primary_image_url: product.primaryImageUrl,
        is_published: product.isPublished,
        variant_count: product.variantCount,
      };

      return departmentToolResult(name, context, parameters, this.now, summary);
    }

    if (name === "marketing.save_content_draft") {
      if (kind !== "marketing_content") {
        return unavailable();
      }
      const campaignId = parameters.campaign_id as string;
      const primaryText = parameters.primary_text as string;
      const headline = parameters.headline as string | undefined;
      const hashtags = (parameters.hashtags as string[]) ?? [];
      const callToAction = parameters.call_to_action as string;
      const modelProvenance = parameters.model_provenance as Record<string, unknown> | undefined;

      const brief = await this.marketingRepository.findBriefByCampaignId(campaignId);
      if (!brief) {
        throw new AgenticApplicationError("CAMPAIGN_NOT_FOUND", `Campaign brief not found for campaign ${campaignId}`);
      }

      // Check prohibited claims
      const combinedText = `${primaryText} ${headline ?? ""}`.toLowerCase();
      for (const claim of brief.prohibitedClaims) {
        if (claim.trim().length > 0 && combinedText.includes(claim.toLowerCase())) {
          throw new AgenticApplicationError(
            "PROHIBITED_CLAIM_DETECTED",
            `Content draft contains prohibited claim: "${claim}"`,
          );
        }
      }

      // Check mandatory message
      if (brief.mandatoryMessage && !combinedText.includes(brief.mandatoryMessage.toLowerCase())) {
        throw new AgenticApplicationError(
          "MANDATORY_MESSAGE_MISSING",
          `Content draft must include mandatory message: "${brief.mandatoryMessage}"`,
        );
      }

      const existingVersions = await this.marketingRepository.findContentVersionsByCampaignId(campaignId);
      const versionNumber = existingVersions.length + 1;
      const contentId = this.generateId();
      const createdAt = this.now();

      const digest = createHash("sha256")
        .update(`${primaryText}\n${headline ?? ""}\n${hashtags.join(",")}\n${callToAction}`)
        .digest("hex");

      const contentVersion: ContentVersion = {
        id: contentId,
        campaignId,
        versionNumber,
        hook: headline ?? "",
        body: primaryText,
        callToAction,
        hashtags,
        visualDirection: "1:1 Square Visual",
        factualClaimSourceIds: [],
        contentDigest: digest,
        costMicros: 0,
        createdAt,
      };

      await this.marketingRepository.createContentVersion(contentVersion);

      // Advance campaign state to visual_creation
      const campaign = await this.marketingRepository.findCampaignById(campaignId);
      if (campaign) {
        if (campaign.state === "validating" && canTransitionState("validating", "content_drafting")) {
          const step1 = await this.marketingRepository.updateCampaignState(campaignId, campaign.version, "content_drafting");
          if (canTransitionState("content_drafting", "visual_creation")) {
            await this.marketingRepository.updateCampaignState(campaignId, step1.version, "visual_creation");
          }
        } else if (campaign.state === "content_drafting" && canTransitionState("content_drafting", "visual_creation")) {
          await this.marketingRepository.updateCampaignState(campaignId, campaign.version, "visual_creation");
        }
      }

      const summary = {
        content_version_id: contentId,
        campaign_id: campaignId,
        version_number: versionNumber,
        headline: headline ?? null,
        primary_text: primaryText,
        call_to_action: callToAction,
        hashtags,
        created_at: createdAt,
      };

      return departmentToolResult(name, context, parameters, this.now, summary);
    }

    if (name === "marketing.save_visual_asset") {
      if (kind !== "marketing_visual") {
        return unavailable();
      }
      const campaignId = parameters.campaign_id as string;
      const assetName = parameters.asset_name as string;
      const assetBytesBase64 = parameters.asset_bytes_base64 as string;
      const promptSummary = parameters.prompt_summary as string | undefined;

      const buffer = Buffer.from(assetBytesBase64, "base64");
      const validation = validatePng1x1Square(buffer);
      if (!validation.valid) {
        throw new AgenticApplicationError("INVALID_IMAGE_FORMAT", "Asset must be a valid PNG image format");
      }

      const brief = await this.marketingRepository.findBriefByCampaignId(campaignId);
      if (!brief) {
        throw new AgenticApplicationError("BRIEF_NOT_FOUND", `Campaign brief for ${campaignId} not found`);
      }

      const assetId = this.generateId();
      const existingAssets = await this.marketingRepository.findVisualAssetsByCampaignId(campaignId);
      const versionNumber = existingAssets.length + 1;
      const createdAt = this.now();
      const sha256Digest = createHash("sha256").update(buffer).digest("hex");
      const storageUri = `minio://marketing-visuals/${campaignId}/${assetId}.png`;

      const visualAsset: VisualAsset = {
        id: assetId,
        campaignId,
        versionNumber,
        mediaType: "image/png",
        aspectRatio: "1:1",
        width: validation.width,
        height: validation.height,
        byteSize: buffer.length,
        imageDigest: sha256Digest,
        altText: assetName,
        storageKey: `marketing-visuals/${campaignId}/${assetId}.png`,
        costMicros: 0,
        createdAt,
      };

      await this.marketingRepository.createVisualAsset(visualAsset);

      // Advance campaign state to campaign_review if appropriate
      const campaign = await this.marketingRepository.findCampaignById(campaignId);
      if (campaign && campaign.state === "visual_creation") {
        if (canTransitionState(campaign.state, "campaign_review")) {
          await this.marketingRepository.updateCampaignState(campaignId, campaign.version, "campaign_review");
        }
      }

      const summary = {
        asset_id: assetId,
        campaign_id: campaignId,
        version_number: versionNumber,
        asset_name: assetName,
        media_type: "image/png",
        aspect_ratio: "1:1",
        dimensions: `${validation.width}x${validation.height}`,
        storage_uri: storageUri,
        sha256_digest: sha256Digest,
        file_size_bytes: buffer.length,
        created_at: createdAt,
      };

      return departmentToolResult(name, context, parameters, this.now, summary);
    }

    if (name === "marketing.assemble_publication_package") {
      if (kind !== "marketing_publisher") {
        return unavailable();
      }
      const campaignId = parameters.campaign_id as string;
      const contentVersionId = parameters.content_version_id as string;
      const visualAssetId = parameters.visual_asset_id as string;

      const brief = await this.marketingRepository.findBriefByCampaignId(campaignId);
      if (!brief) {
        throw new AgenticApplicationError("BRIEF_NOT_FOUND", `Campaign brief for ${campaignId} not found`);
      }

      const contentVersion = await this.marketingRepository.findContentVersionById(contentVersionId);
      const visualAsset = await this.marketingRepository.findVisualAssetById(visualAssetId);

      if (!contentVersion || contentVersion.campaignId !== campaignId) {
        throw new AgenticApplicationError("CONTENT_VERSION_NOT_FOUND", `Content version ${contentVersionId} not found for campaign`);
      }
      if (!visualAsset || visualAsset.campaignId !== campaignId) {
        throw new AgenticApplicationError("VISUAL_ASSET_NOT_FOUND", `Visual asset ${visualAssetId} not found for campaign`);
      }

      const existingPackages = await this.marketingRepository.findPublicationPackagesByCampaignId(campaignId);
      const packageVersion = existingPackages.length + 1;
      const packageId = this.generateId();
      const createdAt = this.now();

      const payloadDigest = createHash("sha256")
        .update(`${contentVersion.contentDigest}:${visualAsset.imageDigest}:${brief.facebookPageConfigurationId}`)
        .digest("hex");

      const publicationPackage: PublicationPackage = {
        id: packageId,
        campaignId,
        packageVersion,
        contentVersionId,
        visualAssetId,
        facebookPageConfigurationId: brief.facebookPageConfigurationId,
        scheduledFor: brief.scheduledFor,
        contentDigest: contentVersion.contentDigest,
        imageDigest: visualAsset.imageDigest,
        packageDigest: payloadDigest,
        status: "draft",
        approvalRequestId: null,
        createdAt,
        updatedAt: createdAt,
      };

      await this.marketingRepository.createPublicationPackage(publicationPackage);

      // Advance campaign state to awaiting_human_approval
      const campaign = await this.marketingRepository.findCampaignById(campaignId);
      if (campaign && (campaign.state === "campaign_review" || campaign.state === "visual_creation")) {
        if (canTransitionState(campaign.state, "awaiting_human_approval")) {
          await this.marketingRepository.updateCampaignState(campaignId, campaign.version, "awaiting_human_approval");
        }
      }

      const summary = {
        package_id: packageId,
        campaign_id: campaignId,
        package_version: packageVersion,
        content_version_id: contentVersionId,
        visual_asset_id: visualAssetId,
        payload_digest: payloadDigest,
        status: "draft" as const,
        created_at: createdAt,
      };

      return departmentToolResult(name, context, parameters, this.now, summary);
    }

    if (name === "marketing.fetch_publication_status") {
      if (kind !== "marketing_publisher") {
        return unavailable();
      }
      const campaignId = parameters.campaign_id as string;
      const campaign = await this.marketingRepository.findCampaignById(campaignId);
      if (!campaign) {
        throw new AgenticApplicationError("CAMPAIGN_NOT_FOUND", `Campaign ${campaignId} not found`);
      }

      const currentPackage = await this.marketingRepository.findCurrentPackageByCampaignId(campaignId);
      const publicationRecord = currentPackage
        ? await this.marketingRepository.findPublicationRecordByPackageId(currentPackage.id)
        : null;

      const summary = {
        campaign_id: campaign.id,
        campaign_state: campaign.state,
        package_id: currentPackage?.id ?? null,
        package_status: currentPackage?.status ?? null,
        approval_request_id: currentPackage?.approvalRequestId ?? null,
        published_at: publicationRecord?.verifiedAt ?? null,
        external_post_id: publicationRecord?.externalPostId ?? null,
        external_post_url: publicationRecord?.postUrl ?? null,
      };

      return departmentToolResult(name, context, parameters, this.now, summary);
    }

    return unavailable();
  }
}
