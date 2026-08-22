// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createCatalogModule,
  createCatalogVariantReader,
  createCatalogHealthReader,
  createStorefrontVariantReader,
  type CatalogModuleDependencies,
} from "./catalog.module";
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
