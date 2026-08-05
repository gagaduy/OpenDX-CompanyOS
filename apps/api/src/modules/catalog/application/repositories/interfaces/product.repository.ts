// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { ProductListQuery } from "../../dtos/requests/product-request.dto";
import type { ProductListItemDto } from "../../dtos/responses/product-response.dto";
import type { Product } from "../../../domain/entities/product";

export interface ProductListProjection
  extends Omit<ProductListItemDto, "availabilitySummary"> {
  readonly variantIds: readonly string[];
}

export interface ProductListResult {
  readonly items: readonly ProductListProjection[];
  readonly totalItems: number;
}

export interface ProductRepository {
  list(session: DatabaseSession, query: ProductListQuery): Promise<ProductListResult>;
  findById(session: DatabaseSession, id: string): Promise<Product | undefined>;
  findBySlug(session: DatabaseSession, slug: string): Promise<Product | undefined>;
  create(session: DatabaseSession, product: Product): Promise<void>;
  update(
    session: DatabaseSession,
    product: Product,
    expectedVersion: number,
  ): Promise<boolean>;
}
