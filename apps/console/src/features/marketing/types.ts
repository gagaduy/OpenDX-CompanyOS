// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type MarketingCampaignState =
  | "draft"
  | "validating"
  | "content_drafting"
  | "visual_creation"
  | "campaign_review"
  | "awaiting_human_approval"
  | "revision_requested"
  | "quality_escalated"
  | "scheduled"
  | "publishing"
  | "publication_unknown"
  | "verifying_publication"
  | "reporting"
  | "completed"
  | "schedule_missed"
  | "platform_rejected"
  | "blocked_credentials"
  | "failed"
  | "canceled";

export interface ProvenanceSource {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly classification: "internal" | "confidential";
}

export interface CampaignBrief {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly objective: string;
  readonly subjectKind: "catalog_product" | "free_topic";
  readonly subjectReference: string;
  readonly audience?: string | null;
  readonly language: "vi" | "en";
  readonly tone?: string | null;
  readonly mandatoryMessage: string;
  readonly prohibitedClaims: readonly string[];
  readonly callToAction: string;
  readonly facebookPageConfigurationId: string;
  readonly scheduledFor: string;
  readonly deadline: string;
  readonly approverId: string;
  readonly maximumCostMicros: number;
  readonly provenance: readonly ProvenanceSource[];
  readonly version: number;
  readonly createdAt: string;
}

export interface ContentVersion {
  readonly id: string;
  readonly campaignId: string;
  readonly versionNumber: number;
  readonly variant: string;
  readonly headline?: string | null;
  readonly body: string;
  readonly primaryText?: string;
  readonly callToAction: string;
  readonly hashtags: readonly string[];
  readonly visualDirection?: string | null;
  readonly factualClaimSourceIds: readonly string[];
  readonly contentDigest: string;
  readonly modelRunId?: string | null;
  readonly costMicros: number;
  readonly createdAt: string;
}

export interface VisualAsset {
  readonly id: string;
  readonly campaignId: string;
  readonly versionNumber: number;
  readonly mediaType: string;
  readonly aspectRatio: "1:1";
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly imageDigest: string;
  readonly altText?: string | null;
  readonly storageKey: string;
  readonly promptSummary?: string;
  readonly modelRunId?: string | null;
  readonly costMicros: number;
  readonly createdAt: string;
}

export interface PublicationPackage {
  readonly id: string;
  readonly campaignId: string;
  readonly packageVersion: number;
  readonly contentVersionId: string;
  readonly visualAssetId: string;
  readonly facebookPageConfigurationId: string;
  readonly scheduledFor: string;
  readonly contentDigest: string;
  readonly imageDigest: string;
  readonly packageDigest: string;
  readonly status: "draft" | "ready_for_review" | "approved" | "rejected" | "superseded";
  readonly approvalRequestId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicationAttempt {
  readonly id: string;
  readonly packageId: string;
  readonly platform: "facebook";
  readonly pageConfigurationId: string;
  readonly status: "started" | "succeeded" | "failed" | "timed_out" | "aborted";
  readonly startedAt: string;
  readonly finishedAt?: string | null;
  readonly durationMs?: number | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}

export interface PublicationRecord {
  readonly id: string;
  readonly packageId: string;
  readonly platform: "facebook";
  readonly pageId: string;
  readonly externalPostId: string;
  readonly postUrl: string;
  readonly packageDigest: string;
  readonly contentDigest: string;
  readonly imageDigest: string;
  readonly verifiedAt: string;
  readonly providerReceiptDigest: string;
  readonly createdAt: string;
}

export type MarketingArtifactKind =
  | "campaign_brief_docx"
  | "facebook_content_docx"
  | "facebook_visual_png"
  | "facebook_publication_log_xlsx"
  | "marketing_final_report_pdf";

export interface MarketingArtifact {
  readonly id: string;
  readonly campaignId: string;
  readonly kind: MarketingArtifactKind;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly sha256Digest: string;
  readonly storageKey: string;
  readonly createdAt: string;
}

export interface MarketingCampaign {
  readonly id: string;
  readonly state: MarketingCampaignState;
  readonly assignmentMode: "direct_department" | "ai_ceo";
  readonly createdBy: string;
  readonly idempotencyKey: string;
  readonly sourceTaskId?: string | null;
  readonly campaignName?: string | null;
  readonly objective?: string | null;
  readonly mandatoryMessage?: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MarketingCampaignDetail {
  readonly campaign: MarketingCampaign;
  readonly brief: CampaignBrief | null;
  readonly contentVersions: readonly ContentVersion[];
  readonly visualAssets: readonly VisualAsset[];
  readonly publicationPackages: readonly PublicationPackage[];
  readonly currentPackage: PublicationPackage | null;
  readonly publicationAttempts: readonly PublicationAttempt[];
  readonly publicationRecord: PublicationRecord | null;
  readonly artifacts: readonly MarketingArtifact[];
}

export interface CreateMarketingCampaignInput {
  readonly assignmentMode?: "direct_department" | "ai_ceo";
  readonly campaignName: string;
  readonly objective: string;
  readonly subject?: {
    readonly kind: "catalog_product" | "free_topic";
    readonly reference: string;
  };
  readonly subjectKind?: "catalog_product" | "free_topic";
  readonly subjectReference?: string;
  readonly audience?: string;
  readonly language: "vi" | "en";
  readonly tone?: string;
  readonly mandatoryMessage: string;
  readonly prohibitedClaims: readonly string[];
  readonly callToAction: string;
  readonly facebookPageConfigurationId: string;
  readonly scheduledFor: string;
  readonly deadline: string;
  readonly approverId: string;
  readonly maximumCostMicros: number;
}
