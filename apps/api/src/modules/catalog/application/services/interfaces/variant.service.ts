// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateVariantRequestDto,
  ReplacePriceRequestDto,
  UpdateVariantRequestDto,
} from "../../dtos/requests/variant-request.dto";
import type { PriceResponseDto, VariantResponseDto } from "../../dtos/responses/variant-response.dto";
import type { CatalogCommandContext } from "./category.service";

export interface VariantServiceContract {
  create(productId: string, request: CreateVariantRequestDto, context: CatalogCommandContext): Promise<VariantResponseDto>;
  update(productId: string, variantId: string, request: UpdateVariantRequestDto, context: CatalogCommandContext): Promise<VariantResponseDto>;
  archive(productId: string, variantId: string, version: number, context: CatalogCommandContext): Promise<VariantResponseDto>;
  replacePrice(productId: string, variantId: string, request: ReplacePriceRequestDto, context: CatalogCommandContext): Promise<PriceResponseDto>;
}
