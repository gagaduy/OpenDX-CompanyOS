// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createCatalogModule,
  createCatalogVariantReader,
  createCatalogHealthReader,
  createStorefrontVariantReader,
  createPublicWishlistProductReader,
  type CatalogModuleDependencies,
} from "./catalog.module";
export type { PublicWishlistProductReader } from "./application/services/interfaces/public-wishlist-product-reader";
export type { PublicProductDto } from "./application/dtos/responses/public-catalog-response.dto";
export type {
  CatalogHealthReader,
  CatalogMerchandisingSummary,
  CatalogProductCompleteness,
  CatalogPublicationEvidence,
  CatalogPublicationReadinessInput,
  CatalogPublicationReadinessResult,
  CatalogReadinessReason,
} from "./application/services/interfaces/catalog-health-reader";
export {
  type CatalogVariantReader,
  type CatalogVariantSummary,
} from "./application/services/interfaces/catalog-variant-reader";
export type {
  StorefrontVariantReader,
  StorefrontVariantSummary,
  CheckoutCatalogReader,
} from "./application/services/interfaces/storefront-variant-reader";
