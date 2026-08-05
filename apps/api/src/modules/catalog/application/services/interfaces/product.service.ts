// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateProductRequestDto,
  ProductListQuery,
  UpdateProductRequestDto,
} from "../../dtos/requests/product-request.dto";
import type {
  PaginatedProductsDto,
  ProductResponseDto,
} from "../../dtos/responses/product-response.dto";
import type { CatalogCommandContext } from "./category.service";

export interface ProductServiceContract {
  list(query: ProductListQuery): Promise<PaginatedProductsDto>;
  get(id: string): Promise<ProductResponseDto>;
  create(request: CreateProductRequestDto, context: CatalogCommandContext): Promise<ProductResponseDto>;
  update(id: string, request: UpdateProductRequestDto, context: CatalogCommandContext): Promise<ProductResponseDto>;
  archive(id: string, version: number, context: CatalogCommandContext): Promise<ProductResponseDto>;
}
