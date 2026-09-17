// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ConflictedCampaignInfoDto {
  readonly id: string;
  readonly name: string;
  readonly endTime: string;
  readonly remainingDays: number;
}

export interface CampaignItemDto {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly originalPriceVnd: number;
  readonly campaignPriceVnd: number;
  readonly discountPercent: number;
  readonly savingAmountVnd: number;
  readonly originalMediaUrl?: string;
  readonly campaignMediaUrl?: string;
  readonly optimizedTitle: string;
  readonly optimizedDescription: string;
  readonly badge: string;
  readonly conflictedCampaign?: ConflictedCampaignInfoDto;
}

export interface CampaignProposalDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly prompt: string;
  readonly themeKey: string;
  readonly badgeText: string;
  readonly discountPercent: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly durationDays: number;
  readonly status: "draft" | "active" | "scheduled" | "completed" | "reverted" | "rejected";
  readonly items: readonly CampaignItemDto[];
  readonly totalProducts: number;
  readonly pricingRationale: string;
  readonly salesProjection: string;
}

export interface ActiveCampaignDto {
  readonly id: string;
  readonly name: string;
  readonly badgeText: string;
  readonly discountPercent: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly totalProducts: number;
  readonly remainingMs: number;
  readonly activeCampaigns?: readonly ActiveCampaignDto[];
}
