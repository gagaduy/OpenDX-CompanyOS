// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type {
  CampaignBrief,
  MarketingCampaign,
} from "../../../domain/entities/marketing-campaign";
import {
  assertValidStateTransition,
  canTransitionState,
} from "../../../domain/services/marketing-campaign-rules";
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
  /\binstagram\b/i,
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
  readonly generateId?: () => string;
  readonly now?: () => string;
}

export class MarketingCampaignService implements IMarketingCampaignService {
  private readonly repository: MarketingRepository;
  private readonly generateId: () => string;
  private readonly now: () => string;

  constructor(options: MarketingCampaignServiceOptions) {
    this.repository = options.repository;
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
          "Marketing scope is strictly limited to single Facebook Page image post publication.",
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
      assignmentMode: input.assignmentMode,
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

    if (currentPackage) {
      [attempts, publicationRecord] = await Promise.all([
        this.repository.findPublicationAttemptsByPackageId(currentPackage.id),
        this.repository.findPublicationRecordByPackageId(currentPackage.id),
      ]);
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

  private toCampaignDto(campaign: MarketingCampaign): MarketingCampaignResponseDto {
    return {
      id: campaign.id,
      state: campaign.state,
      assignmentMode: campaign.assignmentMode,
      createdBy: campaign.createdBy,
      idempotencyKey: campaign.idempotencyKey,
      sourceTaskId: campaign.sourceTaskId ?? null,
      version: campaign.version,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
