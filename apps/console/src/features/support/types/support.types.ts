// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type TicketPriority = "urgent" | "high" | "normal" | "low";
export type TicketStatus = "new" | "assigned" | "in_progress" | "waiting_customer" | "waiting_internal" | "escalated" | "resolved" | "closed";
export type AttachmentStatus = "quarantined" | "clean" | "rejected" | "deleted";
export type AttachmentFormat = "jpg" | "png" | "pdf" | "docx" | "txt";
export interface SupportTicketView { readonly id:string; readonly customerId:string; readonly customerEmail?:string; readonly orderId?:string; readonly subject:string; readonly description:string; readonly priority:TicketPriority; readonly status:TicketStatus; readonly version:number; readonly createdById:string; readonly assigneeId?:string; readonly createdAt:string; readonly updatedAt:string; }
export interface SupportTicketPageView { readonly items:readonly SupportTicketView[]; readonly page:number; readonly pageSize:number; readonly totalItems:number; readonly totalPages:number; }
export interface SupportQuery { readonly status?:TicketStatus; readonly priority?:TicketPriority; readonly assignment?:"all"|"mine"|"unassigned"; readonly page:number; readonly pageSize:number; }
export interface SupportMessageView { readonly id:string; readonly authorId:string; readonly body:string; readonly createdAt:string; }
export interface SupportEventView { readonly id:string; readonly actorId:string; readonly fromStatus:TicketStatus; readonly toStatus:TicketStatus; readonly source:"manual"|"automatic"; readonly occurredAt:string; }
export interface SupportAttachmentView { readonly id:string; readonly ticketId:string; readonly originalFilename:string; readonly format:AttachmentFormat; readonly mediaType:string; readonly byteSize:number; readonly status:AttachmentStatus; readonly version:number; readonly createdById:string; readonly createdAt:string; }
export interface SupportTicketDetailView { readonly ticket:SupportTicketView; readonly context:{ readonly customer:{readonly id:string;readonly email:string;readonly fullName?:string;readonly phoneNumber?:string}; readonly order?:{readonly id:string;readonly publicNumber:string;readonly status:string;readonly totalVnd:number;readonly createdAt:string}; }; readonly messages:readonly SupportMessageView[]; readonly events:readonly SupportEventView[]; readonly attachments:readonly SupportAttachmentView[]; }
export interface SupportTicketCreateInput { readonly customerId:string; readonly orderId?:string; readonly subject:string; readonly description:string; readonly priority:TicketPriority; }

export interface AiSupportTicketItemView {
  readonly ticketId: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly subject: string;
  readonly sentiment: "angry" | "frustrated" | "neutral" | "satisfied";
  readonly churnRisk: "high" | "medium" | "low";
  readonly issueCategory: "shipping_delay" | "product_defect" | "warranty_inquiry" | "order_cancellation" | "general_inquiry";
  readonly proposedResponse: string;
  readonly suggestedCompensation: string;
  readonly priority: "urgent" | "high" | "normal" | "low";
}

export interface AiSupportVipCustomerView {
  readonly customerId: string;
  readonly customerName: string;
  readonly totalSpentVnd: number;
  readonly orderCount: number;
  readonly segment: "VIP Diamond" | "VIP Gold" | "Loyal Customer" | "At Risk";
  readonly engagementRecommendation: string;
}

export interface AiSupportProposalView {
  readonly id: string;
  readonly prompt: string;
  readonly overallSentimentSummary: string;
  readonly churnRiskAssessment: string;
  readonly recommendedAction: string;
  readonly tickets: readonly AiSupportTicketItemView[];
  readonly vipCustomers: readonly AiSupportVipCustomerView[];
  readonly totalTickets: number;
  readonly status: "pending_approval" | "applied" | "canceled";
  readonly createdAt: string;
  readonly docxFilename: string;
}

export interface SupportCampaignRecipientView {
  readonly customerId: string;
  readonly email: string;
  readonly fullName: string;
  readonly totalSpentVnd: number;
  readonly orderCount: number;
  readonly isSelected: boolean;
  readonly sentStatus?: "pending" | "sent" | "failed";
  readonly errorMessage?: string;
}

export interface SupportCampaignProductView {
  readonly productId: string;
  readonly name: string;
  readonly sku: string;
  readonly regularPriceVnd: number;
  readonly salePriceVnd?: number;
  readonly imageUrl: string;
  readonly categoryName?: string;
  readonly storefrontUrl: string;
}

export interface SupportCampaignPromotionView {
  readonly campaignId?: string;
  readonly campaignName: string;
  readonly discountPercent?: number;
  readonly voucherCode?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly description?: string;
}

export interface SupportEmailCampaignProposalView {
  readonly id: string;
  readonly type:
    | "new_product_announcement"
    | "promotion_announcement"
    | "customer_care_vip"
    | "ticket_resolution";
  readonly title: string;
  readonly emailSubject: string;
  readonly targetSegment: "vip_customers" | "recent_buyers" | "all_active_customers";
  readonly recipients: readonly SupportCampaignRecipientView[];
  readonly totalRecipients: number;
  readonly selectedCount: number;
  readonly featuredProducts: readonly SupportCampaignProductView[];
  readonly promotionDetails?: SupportCampaignPromotionView;
  readonly htmlContent: string;
  readonly docxFilename: string;
  readonly status: "pending_approval" | "approved" | "rejected" | "sent" | "partially_sent";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sentAt?: string;
  readonly executionSummary?: {
    readonly successfulDispatches: number;
    readonly failedDispatches: number;
    readonly dispatchedAt: string;
  };
}
