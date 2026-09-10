// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  AssignmentMode,
  CampaignBrief,
  ContentVersion,
  MarketingArtifact,
  MarketingCampaign,
  MarketingCampaignState,
  ProvenanceSource,
  PublicationAttempt,
  PublicationPackage,
  PublicationRecord,
  SubjectKind,
  SupportedLanguage,
  VisualAsset,
} from "../../domain/entities/marketing-campaign";

export interface CreateMarketingCampaignInput {
  readonly assignmentMode: AssignmentMode;
  readonly idempotencyKey: string;
  readonly campaignName: string;
  readonly objective: string;
  readonly subject: {
    readonly kind: SubjectKind;
    readonly reference: string;
  };
  readonly audience?: string;
  readonly language: SupportedLanguage;
  readonly tone?: string;
  readonly mandatoryMessage: string;
  readonly prohibitedClaims: readonly string[];
  readonly callToAction: string;
  readonly facebookPageConfigurationId: string;
  readonly scheduledFor: string;
  readonly deadline: string;
  readonly approverId: string;
  readonly maximumCostMicros: number;
  readonly provenance: readonly ProvenanceSource[];
  readonly sourceTaskId?: string;
}

export interface MarketingCampaignResponseDto {
  readonly id: string;
  readonly state: MarketingCampaignState;
  readonly assignmentMode: AssignmentMode;
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

export interface MarketingCampaignDetailResponseDto {
  readonly campaign: MarketingCampaignResponseDto;
  readonly brief: CampaignBrief | null;
  readonly contentVersions: readonly ContentVersion[];
  readonly visualAssets: readonly VisualAsset[];
  readonly publicationPackages: readonly PublicationPackage[];
  readonly currentPackage: PublicationPackage | null;
  readonly publicationAttempts: readonly PublicationAttempt[];
  readonly publicationRecord: PublicationRecord | null;
  readonly publicationRecords?: readonly PublicationRecord[];
  readonly artifacts: readonly MarketingArtifact[];
}

export interface MarketingCampaignListResponseDto {
  readonly items: readonly MarketingCampaignResponseDto[];
  readonly total: number;
}

export interface ApproveMarketingCampaignInput {
  readonly decision: "approve" | "reject";
  readonly reason?: string;
  readonly facebookPageAccessToken?: string;
}

export interface RequestRevisionMarketingCampaignInput {
  readonly feedback: string;
  readonly targetVersion?: "content" | "visual" | "both";
}

export interface QualityFeedbackMarketingCampaignInput {
  readonly status: "passed" | "escalated";
  readonly notes?: string;
}
