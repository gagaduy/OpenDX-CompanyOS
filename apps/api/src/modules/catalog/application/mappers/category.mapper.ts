// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Category } from "../../domain/entities/category";
import type { CategoryResponseDto } from "../dtos/responses/category-response.dto";

export function mapCategoryResponse(category: Category): CategoryResponseDto {
  return { ...category };
}
