// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export type CatalogReadinessReason =
  | "MISSING_BRAND"
  | "EMPTY_ATTRIBUTES"
  | "NO_ACTIVE_VARIANT"
  | "MISSING_CURRENT_PRICE"
  | "NO_MEDIA"
  | "PRIMARY_MEDIA_INVALID";

export interface CatalogProductCompleteness {
  readonly totalProducts: number;
  readonly draftProducts: number;
  readonly publishedProducts: number;
  readonly missingBrand: number;
  readonly emptyAttributes: number;
  readonly withoutActiveVariant: number;
  readonly withoutCurrentPrice: number;
  readonly withoutMedia: number;
  readonly withoutPrimaryMedia: number;
  readonly completenessBasisPoints: number;
}

export interface CatalogPublicationReadinessInput {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
  readonly limit?: number;
  readonly cursor?: string;
}

export interface CatalogPublicationEvidence {
  readonly productId: string;
  readonly updatedAt: string;
  readonly reasonCodes: readonly CatalogReadinessReason[];
}

export interface CatalogPublicationReadinessSummary {
  readonly draftReviewed: number;
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly reasonCounts: readonly {
    readonly reasonCode: CatalogReadinessReason;
    readonly count: number;
  }[];
}

export interface CatalogPublicationReadinessResult {
  readonly summary: CatalogPublicationReadinessSummary;
  readonly evidence: readonly CatalogPublicationEvidence[];
  readonly nextCursor?: string;
}

export interface CatalogMerchandisingSummary {
  readonly activeCategories: number;
  readonly publishedProducts: number;
  readonly activeVariants: number;
  readonly currentlyPricedVariants: number;
  readonly mediaCoverageBasisPoints: number;
  readonly minimumPriceVnd: number | null;
  readonly maximumPriceVnd: number | null;
  readonly categoryDistribution: readonly {
    readonly categoryId: string;
    readonly productCount: number;
  }[];
  readonly otherCategoryProductCount: number;
}

export interface CatalogHealthReader {
  productCompleteness(asOf: string): Promise<CatalogProductCompleteness>;
  publicationReadiness(
    input: CatalogPublicationReadinessInput,
  ): Promise<CatalogPublicationReadinessResult>;
  merchandisingSummary(asOf: string): Promise<CatalogMerchandisingSummary>;
}

export interface CatalogPublicationReadinessQuery {
  readonly start: string;
  readonly end: string;
  readonly asOf: string;
  readonly limit: number;
  readonly after?: { readonly updatedAt: string; readonly productId: string };
}

export interface CatalogHealthRepository {
  readProductCompleteness(
    session: DatabaseSession,
    asOf: string,
  ): Promise<CatalogProductCompleteness>;
  readPublicationReadiness(
    session: DatabaseSession,
    query: CatalogPublicationReadinessQuery,
  ): Promise<{
    readonly summary: CatalogPublicationReadinessSummary;
    readonly evidence: readonly CatalogPublicationEvidence[];
  }>;
  readMerchandisingSummary(
    session: DatabaseSession,
    asOf: string,
  ): Promise<CatalogMerchandisingSummary>;
}
