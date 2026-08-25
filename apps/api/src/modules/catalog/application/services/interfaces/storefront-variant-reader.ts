// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VariantOptions } from "../../../domain/entities/product-variant";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface StorefrontVariantSummary {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly optionValues: VariantOptions;
  readonly unitPriceVnd: number;
  readonly primaryMediaId: string;
  readonly primaryMediaAltText: string;
}

export interface StorefrontVariantReader {
  getByIds(
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, StorefrontVariantSummary>>;
}

export interface CheckoutCatalogReader {
  getByIdsInSession(
    session: DatabaseSession,
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, StorefrontVariantSummary>>;
}
