// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductMedia } from "../../../domain/entities/product-media";
import type {
  UpdateProductMediaRequestDto,
  UploadProductMediaRequestDto,
} from "../../dtos/requests/media-request.dto";
import type { CatalogCommandContext } from "./category.service";

export interface ProductMediaContent {
  readonly bytes: Uint8Array;
  readonly contentType: ProductMedia["contentType"];
}

export interface ProductMediaServiceContract {
  list(productId: string): Promise<readonly ProductMedia[]>;
  upload(productId: string, request: UploadProductMediaRequestDto, context: CatalogCommandContext): Promise<ProductMedia>;
  update(productId: string, mediaId: string, request: UpdateProductMediaRequestDto, context: CatalogCommandContext): Promise<ProductMedia>;
  delete(productId: string, mediaId: string, context: CatalogCommandContext): Promise<void>;
  getContent(productId: string, mediaId: string): Promise<ProductMediaContent>;
}
