// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductImageContentType } from "../../../domain/entities/product-media";

export interface ProductMediaResponseDto {
  readonly id: string;
  readonly productId: string;
  readonly contentType: ProductImageContentType;
  readonly byteSize: number;
  readonly altText: string;
  readonly sortOrder: number;
  readonly isPrimary: boolean;
  readonly previewUrl: string;
  readonly createdAt: string;
}
