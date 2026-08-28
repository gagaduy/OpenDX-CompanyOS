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
  | "scheduled"
  | "publishing"
  | "publication_unknown"
  | "verifying_publication"
  | "reporting"
  | "completed"
  | "waiting_for_input"
  | "quality_escalated"
  | "blocked_credentials"
  | "platform_rejected"
  | "schedule_missed"
  | "out_of_scope"
  | "cross_department_coordination_required"
  | "failed"
  | "canceled";

export type AssignmentMode = "direct_department" | "ai_ceo";
export type SubjectKind = "catalog_product" | "free_topic";
export type SupportedLanguage = "vi" | "en";
export type ClassificationLevel = "internal" | "confidential";

export interface ProvenanceSource {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly classification: ClassificationLevel;
}

export interface MarketingCampaign {
  readonly id: string;
  readonly state: MarketingCampaignState;
  readonly assignmentMode: AssignmentMode;
  readonly createdBy: string;
  readonly idempotencyKey: string;
  readonly sourceTaskId?: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CampaignBrief {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly objective: string;
  readonly subjectKind: SubjectKind;
  readonly subjectReference: string;
  readonly audience?: string | null;
  readonly language: SupportedLanguage;
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
  readonly hook: string;
  readonly body: string;
  readonly callToAction: string;
  readonly hashtags: readonly string[];
  readonly visualDirection: string;
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
  readonly mediaType: "image/png";
  readonly aspectRatio: "1:1";
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly imageDigest: string;
  readonly altText: string;
  readonly storageKey: string;
  readonly modelRunId?: string | null;
  readonly costMicros: number;
  readonly createdAt: string;
}

export type PublicationPackageStatus =
  | "draft"
  | "submitted_for_approval"
  | "approved"
  | "rejected"
  | "superseded";

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
  readonly status: PublicationPackageStatus;
  readonly approvalRequestId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicationAttempt {
  readonly id: string;
  readonly packageId: string;
  readonly attemptKey: string;
  readonly platform: "facebook";
  readonly pageConfigurationId: string;
  readonly status: "started" | "succeeded" | "failed" | "unknown";
  readonly errorCode?: string | null;
  readonly errorClass?: string | null;
  readonly responseDigest?: string | null;
  readonly startedAt: string;
  readonly finishedAt?: string | null;
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

export const REQUIRED_MARKETING_ARTIFACT_KINDS: readonly MarketingArtifactKind[] = [
  "campaign_brief_docx",
  "facebook_content_docx",
  "facebook_visual_png",
  "facebook_publication_log_xlsx",
  "marketing_final_report_pdf",
] as const;

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
