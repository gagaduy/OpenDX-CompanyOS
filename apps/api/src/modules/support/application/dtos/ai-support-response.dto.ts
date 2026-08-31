// apps/api/src/modules/support/application/dtos/ai-support-response.dto.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface AiSupportTicketItemDto {
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

export interface AiSupportVipCustomerDto {
  readonly customerId: string;
  readonly customerName: string;
  readonly totalSpentVnd: number;
  readonly orderCount: number;
  readonly segment: "VIP Diamond" | "VIP Gold" | "Loyal Customer" | "At Risk";
  readonly engagementRecommendation: string;
}

export interface AiSupportProposalDto {
  readonly id: string;
  readonly prompt: string;
  readonly overallSentimentSummary: string;
  readonly churnRiskAssessment: string;
  readonly recommendedAction: string;
  readonly tickets: readonly AiSupportTicketItemDto[];
  readonly vipCustomers: readonly AiSupportVipCustomerDto[];
  readonly totalTickets: number;
  readonly status: "pending_approval" | "applied";
  readonly createdAt: string;
  readonly docxFilename: string;
}

export interface GenerateSupportProposalRequestDto {
  readonly prompt: string;
}

export interface ApplySupportTicketActionDto {
  readonly ticketId: string;
  readonly responseMessage?: string;
  readonly resolutionStatus?: "in_progress" | "resolved" | "closed";
}

export interface ApplySupportRequestDto {
  readonly items: readonly ApplySupportTicketActionDto[];
}

export interface ApplySupportResultDto {
  readonly proposalId: string;
  readonly appliedCount: number;
  readonly updatedTicketIds: readonly string[];
  readonly appliedAt: string;
}
