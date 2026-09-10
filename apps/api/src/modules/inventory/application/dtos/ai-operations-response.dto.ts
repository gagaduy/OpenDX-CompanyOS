// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type StockRiskClassification = "critical_low" | "balanced" | "slow_moving";

export interface OperationsProposalItemDto {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly sku: string;
  readonly currentOnHand: number;
  readonly currentReserved: number;
  readonly availableQuantity: number;
  readonly safetyStockThreshold: number;
  readonly stockStatus: StockRiskClassification;
  readonly recommendedRestockQuantity: number;
  readonly estimatedUnitCostVnd: number;
  readonly estimatedTotalCostVnd: number;
  readonly actionRationale: string;
}

export interface OperationsProposalDto {
  readonly id: string;
  readonly prompt: string;
  readonly items: readonly OperationsProposalItemDto[];
  readonly totalItems: number;
  readonly totalRestockUnits: number;
  readonly totalEstimatedBudgetVnd: number;
  readonly inventoryHealthSummary: string;
  readonly riskAssessment: string;
  readonly recommendedAction: string;
  readonly status: "pending_approval" | "applied";
  readonly createdAt: string;
  readonly docxFilename: string;
}

export interface GenerateOperationsProposalRequestDto {
  readonly prompt: string;
}

export interface ApplyOperationsItemInputDto {
  readonly variantId: string;
  readonly restockQuantity: number;
}

export interface ApplyOperationsRequestDto {
  readonly items: readonly ApplyOperationsItemInputDto[];
}

export interface ApplyOperationsResultItemDto {
  readonly variantId: string;
  readonly sku: string;
  readonly previousOnHand: number;
  readonly newOnHand: number;
  readonly addedQuantity: number;
}

export interface ApplyOperationsResultDto {
  readonly proposalId: string;
  readonly appliedCount: number;
  readonly updatedItems: readonly ApplyOperationsResultItemDto[];
  readonly appliedAt: string;
}
