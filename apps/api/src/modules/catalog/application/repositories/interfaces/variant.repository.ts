// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { ProductPrice } from "../../../domain/entities/product-price";
import type { ProductVariant } from "../../../domain/entities/product-variant";

export interface VariantRepository {
  findById(session: DatabaseSession, id: string): Promise<ProductVariant | undefined>;
  findBySku(session: DatabaseSession, sku: string): Promise<ProductVariant | undefined>;
  create(session: DatabaseSession, variant: ProductVariant): Promise<void>;
  update(session: DatabaseSession, variant: ProductVariant, expectedVersion: number): Promise<boolean>;
  replaceCurrentPrice(session: DatabaseSession, price: ProductPrice): Promise<void>;
}
