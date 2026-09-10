// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

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

export interface ClaimDueTargetsInput {
  readonly workerId: string;
  readonly now: string;
  readonly leaseSeconds: number;
  readonly limit: number;
}

export interface UpdateTargetStatusInput {
  readonly targetId: string;
  readonly status: PublicationTargetStatus;
  readonly leaseOwner?: string | null;
  readonly leaseExpiresAt?: string | null;
}

export interface MarketingRepository {
  createCampaign(campaign: MarketingCampaign, brief: CampaignBrief): Promise<MarketingCampaign>;
  findCampaignById(id: string): Promise<MarketingCampaign | null>;
  findCampaignByIdempotencyKey(createdBy: string, idempotencyKey: string): Promise<MarketingCampaign | null>;
  listCampaigns(params?: { limit?: number; offset?: number }): Promise<readonly MarketingCampaign[]>;
  updateCampaignState(
    id: string,
    expectedVersion: number,
    nextState: MarketingCampaignState,
  ): Promise<MarketingCampaign>;

  findBriefByCampaignId(campaignId: string): Promise<CampaignBrief | null>;

  createContentVersion(content: ContentVersion): Promise<ContentVersion>;
  findContentVersionsByCampaignId(campaignId: string): Promise<readonly ContentVersion[]>;
  findContentVersionById(id: string): Promise<ContentVersion | null>;

  createVisualAsset(asset: VisualAsset): Promise<VisualAsset>;
  findVisualAssetsByCampaignId(campaignId: string): Promise<readonly VisualAsset[]>;
  findVisualAssetById(id: string): Promise<VisualAsset | null>;

  createPublicationPackage(pkg: PublicationPackage): Promise<PublicationPackage>;
  findPublicationPackagesByCampaignId(campaignId: string): Promise<readonly PublicationPackage[]>;
  findPublicationPackageById(id: string): Promise<PublicationPackage | null>;
  findCurrentPackageByCampaignId(campaignId: string): Promise<PublicationPackage | null>;
  updatePublicationPackageStatus(
    id: string,
    status: PublicationPackageStatus,
    approvalRequestId?: string | null,
  ): Promise<PublicationPackage>;

  createPublicationTargets(targets: readonly PublicationTarget[]): Promise<readonly PublicationTarget[]>;
  findPublicationTargetsByPackageId(packageId: string): Promise<readonly PublicationTarget[]>;
  findPublicationTargetById(id: string): Promise<PublicationTarget | null>;
  claimDuePublicationTargets(input: ClaimDueTargetsInput): Promise<readonly PublicationTarget[]>;
  updatePublicationTargetStatus(input: UpdateTargetStatusInput): Promise<PublicationTarget>;
  releasePublicationTargetLease(targetId: string, workerId: string): Promise<void>;
  findPublicationAttemptsByTargetId(targetId: string): Promise<readonly PublicationAttempt[]>;
  findPublicationRecordByTargetId(targetId: string): Promise<PublicationRecord | null>;

  createPublicationAttempt(attempt: PublicationAttempt): Promise<PublicationAttempt>;
  updatePublicationAttempt(
    id: string,
    status: PublicationAttempt["status"],
    finishedAt?: string,
    errorCode?: string | null,
    errorClass?: string | null,
    responseDigest?: string | null,
    providerReference?: string | null,
  ): Promise<PublicationAttempt>;
  findPublicationAttemptsByPackageId(packageId: string): Promise<readonly PublicationAttempt[]>;

  createPublicationRecord(record: PublicationRecord): Promise<PublicationRecord>;
  findPublicationRecordByPackageId(packageId: string): Promise<PublicationRecord | null>;
  findPublicationRecordsByPackageId?(packageId: string): Promise<readonly PublicationRecord[]>;
  findPublicationRecordByExternalPostId(
    platform: string,
    pageId: string,
    externalPostId: string,
  ): Promise<PublicationRecord | null>;

  createArtifact(artifact: MarketingArtifact): Promise<MarketingArtifact>;
  findArtifactsByCampaignId(campaignId: string): Promise<readonly MarketingArtifact[]>;
  findArtifactById(id: string): Promise<MarketingArtifact | null>;
}
