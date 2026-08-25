// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductImageContentType } from "../../domain/entities/product-media";

export interface ProductMediaStorage {
  upload(objectKey: string, bytes: Uint8Array, contentType: ProductImageContentType): Promise<void>;
  delete(objectKey: string): Promise<void>;
  get(objectKey: string): Promise<Uint8Array>;
}

export interface ProductMediaInspector {
  detectContentType(bytes: Uint8Array): Promise<ProductImageContentType | undefined>;
}
