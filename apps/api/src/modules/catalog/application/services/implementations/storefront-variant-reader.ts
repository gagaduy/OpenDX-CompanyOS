// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { PublicCatalogRepository } from "../../repositories/interfaces/public-catalog.repository";
import type {
  StorefrontVariantReader,
  StorefrontVariantSummary,
} from "../interfaces/storefront-variant-reader";

export class StorefrontVariantReaderService implements StorefrontVariantReader {
  constructor(
    private readonly repository: PublicCatalogRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async getByIds(
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, StorefrontVariantSummary>> {
    const uniqueIds = [...new Set(variantIds)];
    if (uniqueIds.length === 0) return new Map();

    return this.transactions.runReadOnly(async (session) => {
      const variants = await this.repository.findStorefrontVariants(session, uniqueIds);
      return new Map(variants.map((variant) => [variant.variantId, variant]));
    });
  }
}
