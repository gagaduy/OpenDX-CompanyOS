// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateMarketingCampaignInput,
  MarketingCampaignDetailResponseDto,
  MarketingCampaignListResponseDto,
  MarketingCampaignResponseDto,
} from "../../dtos/marketing.dto";

export interface IMarketingCampaignService {
  createCampaign(
    actorId: string,
    input: CreateMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto>;

  getCampaign(id: string): Promise<MarketingCampaignDetailResponseDto>;

  listCampaigns(params?: {
    limit?: number;
    offset?: number;
  }): Promise<MarketingCampaignListResponseDto>;

  markReady(
    actorId: string,
    campaignId: string,
  ): Promise<MarketingCampaignResponseDto>;

  cancelCampaign(
    actorId: string,
    campaignId: string,
    reason?: string,
  ): Promise<MarketingCampaignResponseDto>;

  approveCampaign(
    actorId: string,
    campaignId: string,
    input: import("../../dtos/marketing.dto").ApproveMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto>;

  requestRevision(
    actorId: string,
    campaignId: string,
    input: import("../../dtos/marketing.dto").RequestRevisionMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto>;

  qualityFeedback(
    actorId: string,
    campaignId: string,
    input: import("../../dtos/marketing.dto").QualityFeedbackMarketingCampaignInput,
  ): Promise<MarketingCampaignResponseDto>;
}

export type MarketingCampaignService = IMarketingCampaignService;
