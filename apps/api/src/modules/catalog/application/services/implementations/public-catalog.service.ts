// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryAvailabilityReader } from "../../../../inventory";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { PublicProductListQuery } from "../../dtos/requests/public-catalog-request.dto";
import type {
  PaginatedPublicProductsDto,
  PublicProductDto,
  StorefrontHeroSlideDto,
  StorefrontHeroPresentationDto,
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

  getStorefrontContent() {
    return this.transactions.runReadOnly((session) =>
      this.repository.listStorefrontContent(session),
    );
  }

  listCategories() {
    return this.transactions.runReadOnly((session) =>
      this.repository.listCategories(session),
    );
  }

  async listHeroSlides(): Promise<readonly StorefrontHeroSlideDto[]> {
    return this.transactions.runReadOnly(async (session) => {
      const slides = await this.repository.listHeroSlides(session);
      const products = await this.enrich(
        slides.map(({ product }) => product),
      );
      return slides.map((slide, index) => ({
        category: slide.category,
        product: products[index]!,
      }));
    });
  }

  async getHeroPresentation(): Promise<StorefrontHeroPresentationDto> {
    return this.transactions.runReadOnly(async (session) => {
      const presentation = await this.repository.findActiveHeroPresentation(session);
      if (
        presentation !== undefined &&
        presentation.configuredChapterCount > 0 &&
        presentation.slides.length === presentation.configuredChapterCount
      ) {
        const products = await this.enrich(
          presentation.slides.map(({ product }) => product),
        );
        return {
          media: {
            id: presentation.media.id,
            contentUrl: `/v1/storefront/hero-media/${presentation.media.id}/content`,
            contentType: presentation.media.contentType,
            byteSize: presentation.media.byteSize,
            durationMs: presentation.media.durationMs,
          },
          slides: presentation.slides.map((slide, index) => ({
            category: slide.category,
            product: products[index]!,
            chapter: slide.chapter,
          })),
        };
      }

      const slides = await this.repository.listHeroSlides(session);
      const products = await this.enrich(slides.map(({ product }) => product));
      return {
        slides: slides.map((slide, index) => ({
          category: slide.category,
          product: products[index]!,
        })),
      };
    });
  }

  async listProducts(
    query: PublicProductListQuery,
  ): Promise<PaginatedPublicProductsDto> {
    return this.transactions.runReadOnly(async (session) => {
      if (query.stockStatus !== undefined) {
        const candidates: PublicProductProjection[] = [];
        let candidatePage = 1;
        let totalCandidates = 0;
        do {
          const result = await this.repository.listProducts(session, {
            ...query,
            page: candidatePage,
            pageSize: 100,
          });
          candidates.push(...result.items);
          totalCandidates = result.totalItems;
          candidatePage += 1;
        } while (candidates.length < totalCandidates);
        const matching = (await this.enrich(candidates)).filter((product) => {
          const inStock = product.variants.some(({ purchasable }) => purchasable);
          return query.stockStatus === "in_stock" ? inStock : !inStock;
        });
        const start = (query.page - 1) * query.pageSize;
        return {
          items: matching.slice(start, start + query.pageSize),
          page: query.page,
          pageSize: query.pageSize,
          totalItems: matching.length,
          totalPages: Math.ceil(matching.length / query.pageSize),
        };
      }
      const result = await this.repository.listProducts(session, query);
      const products = await this.enrich(result.items);
      return {
        items: products,
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
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

  async getPublishedByIds(
    productIds: readonly string[],
  ): Promise<readonly PublicProductDto[]> {
    if (productIds.length === 0) return [];
    return this.transactions.runReadOnly(async (session) =>
      this.enrich(await this.repository.findProductsByIds(session, productIds)),
    );
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

  async getHeroMediaContentAuthorization(mediaId: string) {
    return this.transactions.runReadOnly(async (session) => {
      const authorization = await this.repository.findHeroMediaAuthorization(
        session,
        mediaId,
      );
      if (authorization === undefined) {
        throw new CatalogApplicationError(
          "NOT_FOUND",
          "Active hero media not found",
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
