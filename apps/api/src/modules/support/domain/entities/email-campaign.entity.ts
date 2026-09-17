// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type EmailCampaignType =
  | "new_product_announcement"
  | "promotion_announcement"
  | "customer_care_vip"
  | "ticket_resolution";

export type CustomerSegmentType =
  | "vip_customers"
  | "recent_buyers"
  | "all_active_customers";

export type CampaignProposalStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "sent"
  | "partially_sent";

export interface CampaignRecipientItem {
  readonly customerId: string;
  readonly email: string;
  readonly fullName: string;
  readonly totalSpentVnd: number;
  readonly orderCount: number;
  readonly isSelected: boolean;
  readonly sentStatus?: "pending" | "sent" | "failed";
  readonly errorMessage?: string;
}

export interface FeaturedProductItem {
  readonly productId: string;
  readonly name: string;
  readonly sku: string;
  readonly regularPriceVnd: number;
  readonly salePriceVnd?: number;
  readonly imageUrl: string;
  readonly categoryName?: string;
  readonly storefrontUrl: string;
}

export interface CampaignPromotionDetails {
  readonly campaignId?: string;
  readonly campaignName: string;
  readonly discountPercent?: number;
  readonly voucherCode?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly description?: string;
  readonly productIds?: readonly string[];
}

export interface SupportEmailCampaignProposal {
  readonly id: string;
  readonly type: EmailCampaignType;
  readonly title: string;
  readonly emailSubject: string;
  readonly targetSegment: CustomerSegmentType;
  readonly recipients: readonly CampaignRecipientItem[];
  readonly totalRecipients: number;
  readonly selectedCount: number;
  readonly featuredProducts: readonly FeaturedProductItem[];
  readonly promotionDetails?: CampaignPromotionDetails;
  readonly htmlContent: string;
  readonly docxFilename: string;
  readonly status: CampaignProposalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sentAt?: string;
  readonly executionSummary?: {
    readonly successfulDispatches: number;
    readonly failedDispatches: number;
    readonly dispatchedAt: string;
  };
}

export function validateEmailCampaignProposal(
  proposal: SupportEmailCampaignProposal,
): void {
  if (!proposal.id || proposal.id.trim() === "") {
    throw new Error("Mã đề xuất chiến dịch email không hợp lệ.");
  }
  if (!proposal.title || proposal.title.trim() === "") {
    throw new Error("Tiêu đề chiến dịch email không được để trống.");
  }
  if (!proposal.emailSubject || proposal.emailSubject.trim() === "") {
    throw new Error("Tiêu đề email không được để trống.");
  }
  if (!proposal.htmlContent || proposal.htmlContent.trim() === "") {
    throw new Error("Nội dung email HTML không được để trống.");
  }
  if (!proposal.recipients || proposal.recipients.length === 0) {
    throw new Error("Chiến dịch email phải có ít nhất 1 người nhận.");
  }
  if (
    proposal.type === "new_product_announcement" &&
    (!proposal.featuredProducts || proposal.featuredProducts.length === 0)
  ) {
    throw new Error(
      "Chiến dịch quảng bá sản phẩm mới phải có ít nhất 1 sản phẩm nổi bật.",
    );
  }
}
