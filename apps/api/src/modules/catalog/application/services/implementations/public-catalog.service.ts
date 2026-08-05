// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryAvailabilityReader } from "../../../../inventory/application/services/interfaces/inventory-availability";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { PublicProductListQuery } from "../../dtos/requests/public-catalog-request.dto";
import type {
  PaginatedPublicProductsDto,
  PublicProductDto,
} from "../../dtos/responses/public-catalog-response.dto";
import type {
  PublicCatalogRepository,
  PublicProductProjection,
} from "../../repositories/interfaces/public-catalog.repository";
import { CatalogApplicationError } from "../catalog-application.error";
import type { PublicCatalogServiceContract } from "../interfaces/public-catalog.service";

export class PublicCatalogService implements PublicCatalogServiceContract {
  constructor(
    private readonly repository: PublicCatalogRepository,
    private readonly inventory: InventoryAvailabilityReader,
    private readonly transactions: TransactionRunner,
  ) {}

  listCategories() {
    return this.transactions.runReadOnly((session) =>
      this.repository.listCategories(session),
    );
  }

  async listProducts(
    query: PublicProductListQuery,
  ): Promise<PaginatedPublicProductsDto> {
    return this.transactions.runReadOnly(async (session) => {
      const result = await this.repository.listProducts(session, query);
      const products = await this.enrich(result.items);
      const items = products.filter((product) => {
        if (query.stockStatus === undefined) return true;
        const inStock = product.variants.some(({ purchasable }) => purchasable);
        return query.stockStatus === "in_stock" ? inStock : !inStock;
      });
      const totalItems =
        query.stockStatus === undefined ? result.totalItems : items.length;
      return {
        items,
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      };
    });
  }

  async getProductBySlug(slug: string): Promise<PublicProductDto> {
    return this.transactions.runReadOnly(async (session) => {
      const product = await this.repository.findProductBySlug(session, slug);
      if (product === undefined) {
        throw new CatalogApplicationError(
          "PRODUCT_NOT_PUBLISHED",
          "Published product not found",
        );
      }
      return (await this.enrich([product]))[0]!;
    });
  }

  async getMediaContentAuthorization(productId: string, mediaId: string) {
    return this.transactions.runReadOnly(async (session) => {
      const authorization = await this.repository.findMediaAuthorization(
        session,
        productId,
        mediaId,
      );
      if (authorization === undefined) {
        throw new CatalogApplicationError(
          "PRODUCT_NOT_PUBLISHED",
          "Published product media not found",
        );
      }
      return authorization;
    });
  }

  private async enrich(
    products: readonly PublicProductProjection[],
  ): Promise<readonly PublicProductDto[]> {
    const variantIds = products.flatMap(({ variants }) =>
      variants.map(({ id }) => id),
    );
    const availability = await this.inventory.getByVariantIds(variantIds);
    return products.map((product) => ({
      ...product,
      primaryMedia: {
        ...product.primaryMedia,
        contentUrl: `/v1/storefront/products/${product.id}/media/${product.primaryMedia.id}/content`,
      },
      variants: product.variants.map((variant) => {
        const stock = availability.get(variant.id);
        const availableQuantity = stock?.available ?? 0;
        return {
          ...variant,
          availableQuantity,
          purchasable: stock?.initialized === true && availableQuantity > 0,
        };
      }),
    }));
  }
}
