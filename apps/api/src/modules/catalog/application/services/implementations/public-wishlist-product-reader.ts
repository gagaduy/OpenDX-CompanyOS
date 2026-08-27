// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PublicProductDto } from "../../dtos/responses/public-catalog-response.dto";
import type { PublicWishlistProductReader } from "../interfaces/public-wishlist-product-reader";

interface PublishedCatalogReader {
  getPublishedByIds(
    productIds: readonly string[],
  ): Promise<readonly PublicProductDto[]>;
}

export class PublicWishlistProductReaderService
  implements PublicWishlistProductReader
{
  constructor(private readonly catalog: PublishedCatalogReader) {}

  async getPublishedByIds(
    productIds: readonly string[],
  ): Promise<readonly PublicProductDto[]> {
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length === 0) return [];
    const products = await this.catalog.getPublishedByIds(uniqueIds);
    const byId = new Map(products.map((product) => [product.id, product]));
    return uniqueIds.flatMap((id) => {
      const product = byId.get(id);
      return product === undefined ? [] : [product];
    });
  }
}
