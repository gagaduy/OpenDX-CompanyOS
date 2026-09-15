// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CampaignPromotionDetails } from "../../domain/entities/email-campaign.entity";

export interface PromotionQueryPort {
  getActiveAndUpcomingCampaigns(): Promise<CampaignPromotionDetails[]>;
  getCampaignById(campaignId: string): Promise<CampaignPromotionDetails | null>;
}
