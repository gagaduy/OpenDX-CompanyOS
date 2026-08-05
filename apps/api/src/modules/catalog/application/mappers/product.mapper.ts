// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Product } from "../../domain/entities/product";
import type { ProductResponseDto } from "../dtos/responses/product-response.dto";

export function mapProductResponse(product: Product): ProductResponseDto {
  return structuredClone(product);
}
