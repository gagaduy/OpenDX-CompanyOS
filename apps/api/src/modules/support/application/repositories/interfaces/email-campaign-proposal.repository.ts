// apps/api/src/modules/support/application/repositories/interfaces/email-campaign-proposal.repository.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CampaignProposalStatus,
  SupportEmailCampaignProposal,
} from "../../../domain/entities/email-campaign.entity";

export interface EmailCampaignProposalRepository {
  save(proposal: SupportEmailCampaignProposal): Promise<void>;
  findById(id: string): Promise<SupportEmailCampaignProposal | undefined>;
  list(filter?: {
    status?: CampaignProposalStatus;
    limit?: number;
  }): Promise<readonly SupportEmailCampaignProposal[]>;
}
