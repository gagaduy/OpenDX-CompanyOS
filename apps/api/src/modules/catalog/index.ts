// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createCatalogModule,
  createCatalogVariantReader,
  createStorefrontVariantReader,
  type CatalogModuleDependencies,
} from "./catalog.module";
export {
  type CatalogVariantReader,
  type CatalogVariantSummary,
} from "./application/services/interfaces/catalog-variant-reader";
export type {
  StorefrontVariantReader,
  StorefrontVariantSummary,
  CheckoutCatalogReader,
} from "./application/services/interfaces/storefront-variant-reader";
