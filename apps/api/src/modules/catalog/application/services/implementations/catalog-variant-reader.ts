// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { VariantRepository } from "../../repositories/interfaces/variant.repository";
import type {
  CatalogVariantReader,
  CatalogVariantSummary,
} from "../interfaces/catalog-variant-reader";

export class CatalogVariantReaderService implements CatalogVariantReader {
  constructor(private readonly variants: VariantRepository) {}

  async findById(
    session: DatabaseSession,
    variantId: string,
  ): Promise<CatalogVariantSummary | undefined> {
    const variant = await this.variants.findById(session, variantId);
    if (variant === undefined) return undefined;
    return { id: variant.id, sku: variant.sku, status: variant.status };
  }
}
