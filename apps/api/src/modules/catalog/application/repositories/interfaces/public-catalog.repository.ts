// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { ProductAttributes } from "../../../domain/entities/product";
import type { VariantOptions } from "../../../domain/entities/product-variant";
import type { PublicProductListQuery } from "../../dtos/requests/public-catalog-request.dto";
import type { PublicCategoryDto } from "../../dtos/responses/public-catalog-response.dto";

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
    };
  }[];
}

export interface PublicProductListResult {
  readonly items: readonly PublicProductProjection[];
  readonly totalItems: number;
}

export interface PublicMediaAuthorization {
  readonly productId: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly contentType: string;
}

export interface PublicCatalogRepository {
  inspectPublicationReadiness(
    session: DatabaseSession,
    productId: string,
  ): Promise<PublicationReadinessSnapshot | undefined>;
  listCategories(session: DatabaseSession): Promise<readonly PublicCategoryDto[]>;
  listProducts(
    session: DatabaseSession,
    query: PublicProductListQuery,
  ): Promise<PublicProductListResult>;
  findProductBySlug(
    session: DatabaseSession,
    slug: string,
  ): Promise<PublicProductProjection | undefined>;
  findMediaAuthorization(
    session: DatabaseSession,
    productId: string,
    mediaId: string,
  ): Promise<PublicMediaAuthorization | undefined>;
}
