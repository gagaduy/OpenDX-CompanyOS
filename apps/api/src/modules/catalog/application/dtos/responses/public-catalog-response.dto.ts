// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductAttributes } from "../../../domain/entities/product";
import type { VariantOptions } from "../../../domain/entities/product-variant";

export type PublicationRequirement =
  | "ACTIVE_CATEGORY"
  | "ACTIVE_VARIANT"
  | "CURRENT_PRICE"
  | "PRIMARY_IMAGE"
  | "INVENTORY_ITEM";

export interface PublicationReadinessDto {
  readonly ready: boolean;
  readonly missing: readonly PublicationRequirement[];
}

export interface PublicCategoryDto {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly sortOrder: number;
}

export interface PublicProductMediaDto {
  readonly id: string;
  readonly altText: string;
  readonly contentUrl: string;
}

export interface PublicProductVariantDto {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly optionValues: VariantOptions;
  readonly price: {
    readonly amountMinor: number;
    readonly currency: "VND";
  };
  readonly availableQuantity: number;
  readonly purchasable: boolean;
}

export interface PublicProductDto {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly name: string;
  readonly slug: string;
  readonly brand?: string;
  readonly description: string;
  readonly attributes: ProductAttributes;
  readonly primaryMedia: PublicProductMediaDto;
  readonly variants: readonly PublicProductVariantDto[];
}

export interface PaginatedPublicProductsDto {
  readonly items: readonly PublicProductDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
