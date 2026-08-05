// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateCategoryRequestDto,
  UpdateCategoryRequestDto,
} from "../../dtos/requests/category-request.dto";
import type { CategoryResponseDto } from "../../dtos/responses/category-response.dto";

export interface CatalogCommandContext {
  readonly actorId: string;
  readonly correlationId: string;
}

export interface CategoryServiceContract {
  list(): Promise<readonly CategoryResponseDto[]>;
  create(
    request: CreateCategoryRequestDto,
    context: CatalogCommandContext,
  ): Promise<CategoryResponseDto>;
  update(
    id: string,
    request: UpdateCategoryRequestDto,
    context: CatalogCommandContext,
  ): Promise<CategoryResponseDto>;
  archive(
    id: string,
    version: number,
    context: CatalogCommandContext,
  ): Promise<CategoryResponseDto>;
}
