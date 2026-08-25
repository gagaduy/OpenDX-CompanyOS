// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductAttributes, ProductStatus } from "../../../domain/entities/product";

export interface ProductListQuery {
  readonly query?: string;
  readonly categoryId?: string;
  readonly status?: ProductStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateProductRequestDto {
  readonly categoryId: string;
  readonly name: string;
  readonly slug?: string;
  readonly brand?: string;
  readonly description: string;
  readonly attributes: ProductAttributes;
}

export interface UpdateProductRequestDto {
  readonly categoryId?: string;
  readonly name?: string;
  readonly slug?: string;
  readonly brand?: string | null;
  readonly description?: string;
  readonly attributes?: ProductAttributes;
  readonly version: number;
}
