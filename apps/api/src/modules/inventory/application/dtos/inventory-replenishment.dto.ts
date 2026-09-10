// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ReplenishmentProposalItemDto {
  readonly sku: string;
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly categoryName: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly availableQuantity: number;
  readonly recentUnitsSold7d: number;
  readonly recommendedRestockQuantity: number;
  readonly estimatedUnitCostVnd: number;
  readonly estimatedLineCostVnd: number;
  readonly actionRationale: string;
}

export type ReplenishmentTriggerSource = "scheduled_cron" | "post_order_event" | "manual";
export type ReplenishmentProposalStatus = "pending_review" | "approved" | "dismissed";

export interface ReplenishmentProposalDto {
  readonly id: string;
  readonly triggerSource: ReplenishmentTriggerSource;
  readonly status: ReplenishmentProposalStatus;
  readonly summary: string;
  readonly riskAssessment: string;
  readonly items: readonly ReplenishmentProposalItemDto[];
  readonly totalBudgetVnd: number;
  readonly docxReportKey?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
}

export interface CreateReplenishmentProposalInput {
  readonly id: string;
  readonly triggerSource: ReplenishmentTriggerSource;
  readonly status: ReplenishmentProposalStatus;
  readonly summary: string;
  readonly riskAssessment?: string;
  readonly items: readonly ReplenishmentProposalItemDto[];
  readonly totalBudgetVnd: number;
  readonly docxReportKey?: string;
}
