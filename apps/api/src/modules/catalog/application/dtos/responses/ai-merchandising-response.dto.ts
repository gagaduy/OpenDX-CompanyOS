// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface MerchandisingItemDto {
  readonly targetProductId: string;
  readonly targetVariantId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly categoryName: string;
  readonly optimizedTitle: string;
  readonly optimizedDescription: string;
  readonly badge: string;
  readonly originalPriceVnd: number;
  readonly proposedPriceVnd: number;
  readonly discountPercent: number;
  readonly savingAmountVnd: number;
}

export interface MerchandisingProposalDto {
  readonly id: string;
  readonly prompt: string;
  readonly items: readonly MerchandisingItemDto[];
  // Convenience top-level fields for single-item backwards compatibility
  readonly targetProductId?: string;
  readonly targetVariantId?: string;
  readonly productName?: string;
  readonly productSlug?: string;
  readonly categoryName?: string;
  readonly optimizedTitle?: string;
  readonly optimizedDescription?: string;
  readonly badge?: string;
  readonly originalPriceVnd?: number;
  readonly proposedPriceVnd?: number;
  readonly discountPercent?: number;
  readonly savingAmountVnd?: number;
  readonly pricingRationale: string;
  readonly salesProjection: string;
  readonly status: "pending_approval" | "applied" | "rejected";
  readonly createdAt: string;
}

export interface ApplyMerchandisingResultItemDto {
  readonly productId: string;
  readonly productName: string;
  readonly originalPriceVnd: number;
  readonly newPriceVnd: number;
  readonly discountPercent: number;
  readonly badge: string;
}

export interface ApplyMerchandisingResultDto {
  readonly success: boolean;
  readonly proposalId: string;
  readonly updatedCount: number;
  readonly items: readonly ApplyMerchandisingResultItemDto[];
  readonly appliedAt: string;
  // Backwards compatibility fields
  readonly productId?: string;
  readonly productName?: string;
  readonly originalPriceVnd?: number;
  readonly newPriceVnd?: number;
  readonly discountPercent?: number;
  readonly badge?: string;
}
