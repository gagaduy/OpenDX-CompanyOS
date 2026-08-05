// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type ProductImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif";

export interface ProductMedia {
  readonly id: string;
  readonly productId: string;
  readonly objectKey: string;
  readonly contentType: ProductImageContentType;
  readonly byteSize: number;
  readonly altText: string;
  readonly sortOrder: number;
  readonly isPrimary: boolean;
  readonly createdAt: string;
}
