// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Product, ProductStatus } from "../../../domain/entities/product";

export type ProductResponseDto = Product;

export interface ProductListItemDto {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly name: string;
  readonly slug: string;
  readonly brand?: string;
  readonly status: ProductStatus;
  readonly primaryMediaId?: string;
  readonly variantCount: number;
  readonly minimumPrice?: number;
  readonly maximumPrice?: number;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PaginatedProductsDto {
  readonly items: readonly ProductListItemDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
