// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { ProductAttributes } from "../../../domain/entities/product";
import type { VariantOptions } from "../../../domain/entities/product-variant";
import type { PublicProductListQuery } from "../../dtos/requests/public-catalog-request.dto";
import type {
  PublicCategoryDto,
  PublicStorefrontContentDto,
} from "../../dtos/responses/public-catalog-response.dto";

export interface PublicationReadinessSnapshot {
  readonly categoryActive: boolean;
  readonly primaryImageCount: number;
  readonly activeVariants: readonly {
    readonly variantId: string;
    readonly hasCurrentPrice: boolean;
  }[];
}

export interface PublicProductProjection {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly name: string;
  readonly slug: string;
  readonly brand?: string;
  readonly description: string;
  readonly attributes: ProductAttributes;
  readonly primaryMedia: {
    readonly id: string;
    readonly altText: string;
  };
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly title: string;
    readonly optionValues: VariantOptions;
    readonly price: {
      readonly amountMinor: number;
      readonly currency: "VND";
      readonly previousAmountMinor?: number;
      readonly discountPercentage?: number;
    };
  }[];
}

export interface PublicProductListResult {
  readonly items: readonly PublicProductProjection[];
  readonly totalItems: number;
}

export interface PublicHeroSlideProjection {
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly product: PublicProductProjection;
}

export interface PublicHeroPresentationProjection {
  readonly media: {
    readonly id: string;
    readonly objectKey: string;
    readonly contentType: "video/mp4";
    readonly byteSize: number;
    readonly durationMs: number;
  };
  readonly configuredChapterCount: number;
  readonly slides: readonly (PublicHeroSlideProjection & {
    readonly chapter: {
      readonly startMs: number;
      readonly endMs: number;
      readonly label: string;
    };
  })[];
}

export interface PublicHeroMediaAuthorization {
  readonly mediaId: string;
  readonly objectKey: string;
  readonly contentType: "video/mp4";
  readonly byteSize: number;
}

export interface PublicMediaAuthorization {
  readonly productId: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly contentType: string;
}

export interface StorefrontVariantProjection {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly optionValues: VariantOptions;
  readonly unitPriceVnd: number;
  readonly primaryMediaId: string;
  readonly primaryMediaAltText: string;
}

export interface PublicCatalogRepository {
  listStorefrontContent(
    session: DatabaseSession,
  ): Promise<PublicStorefrontContentDto>;
  inspectPublicationReadiness(
    session: DatabaseSession,
    productId: string,
  ): Promise<PublicationReadinessSnapshot | undefined>;
  listCategories(session: DatabaseSession): Promise<readonly PublicCategoryDto[]>;
  listHeroSlides(
    session: DatabaseSession,
  ): Promise<readonly PublicHeroSlideProjection[]>;
  findActiveHeroPresentation(
    session: DatabaseSession,
  ): Promise<PublicHeroPresentationProjection | undefined>;
  findHeroMediaAuthorization(
    session: DatabaseSession,
    mediaId: string,
  ): Promise<PublicHeroMediaAuthorization | undefined>;
  listProducts(
    session: DatabaseSession,
    query: PublicProductListQuery,
  ): Promise<PublicProductListResult>;
  findProductBySlug(
    session: DatabaseSession,
    slug: string,
  ): Promise<PublicProductProjection | undefined>;
  findProductsByIds(
    session: DatabaseSession,
    productIds: readonly string[],
  ): Promise<readonly PublicProductProjection[]>;
  findMediaAuthorization(
    session: DatabaseSession,
    productId: string,
    mediaId: string,
  ): Promise<PublicMediaAuthorization | undefined>;
  findStorefrontVariants(
    session: DatabaseSession,
    variantIds: readonly string[],
  ): Promise<readonly StorefrontVariantProjection[]>;
}
