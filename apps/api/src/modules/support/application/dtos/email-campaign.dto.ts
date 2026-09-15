// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CampaignPromotionDetails,
  CampaignRecipientItem,
  CustomerSegmentType,
  EmailCampaignType,
  FeaturedProductItem,
  SupportEmailCampaignProposal,
} from "../../domain/entities/email-campaign.entity";

export interface CreateEmailCampaignProposalInput {
  readonly type: EmailCampaignType;
  readonly prompt?: string;
  readonly targetSegment?: CustomerSegmentType;
  readonly productIds?: string[];
  readonly promotionId?: string;
  readonly customSubject?: string;
}

export interface ApplyEmailCampaignProposalInput {
  readonly selectedRecipientIds?: string[];
}

export interface EmailCampaignProposalSummaryView {
  readonly id: string;
  readonly type: EmailCampaignType;
  readonly title: string;
  readonly emailSubject: string;
  readonly targetSegment: CustomerSegmentType;
  readonly totalRecipients: number;
  readonly selectedCount: number;
  readonly featuredProductCount: number;
  readonly status: string;
  readonly docxFilename: string;
  readonly createdAt: string;
  readonly sentAt?: string;
}

export interface EmailCampaignProposalDetailView {
  readonly proposal: SupportEmailCampaignProposal;
  readonly featuredProducts: readonly FeaturedProductItem[];
  readonly promotionDetails?: CampaignPromotionDetails;
  readonly recipients: readonly CampaignRecipientItem[];
}

export interface ApplyEmailCampaignResult {
  readonly proposalId: string;
  readonly status: "sent" | "partially_sent";
  readonly totalDispatched: number;
  readonly successfulDispatches: number;
  readonly failedDispatches: number;
  readonly dispatchedAt: string;
}
