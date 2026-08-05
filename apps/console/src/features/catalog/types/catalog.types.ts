// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CatalogStatus = "active" | "draft" | "published" | "archived";
export type AttributeValue = string | number | boolean | readonly string[];

export interface Category {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly sortOrder: number;
  readonly status: "active" | "archived";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface Product {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly slug: string;
  readonly brand?: string;
  readonly description: string;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly status: "draft" | "published" | "archived";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface ProductListItem {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly name: string;
  readonly slug: string;
  readonly brand?: string;
  readonly status: "draft" | "published" | "archived";
  readonly primaryMediaId?: string;
  readonly variantCount: number;
  readonly minimumPrice?: number;
  readonly maximumPrice?: number;
  readonly availabilitySummary: {
    readonly totalAvailable: number;
    readonly purchasableVariantCount: number;
  };
  readonly updatedAt: string;
  readonly version: number;
}

export interface ProductPage {
  readonly items: readonly ProductListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface ProductQuery {
  readonly query?: string;
  readonly categoryId?: string;
  readonly status?: "draft" | "published" | "archived";
  readonly page: number;
  readonly pageSize: number;
}

export type PublicationRequirement = "ACTIVE_CATEGORY" | "ACTIVE_VARIANT" | "CURRENT_PRICE" | "PRIMARY_IMAGE" | "INVENTORY_ITEM";
export interface PublicationReadiness {
  readonly ready: boolean;
  readonly missing: readonly PublicationRequirement[];
}

export interface ProductInput {
  readonly categoryId: string;
  readonly name: string;
  readonly slug?: string;
  readonly brand?: string;
  readonly description: string;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

export interface ProductUpdate extends Partial<ProductInput> {
  readonly version: number;
}

export interface CategoryInput {
  readonly name: string;
  readonly parentId?: string;
  readonly description?: string;
  readonly sortOrder?: number;
}

export interface ProductVariant {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly title: string;
  readonly optionValues: Readonly<Record<string, string>>;
  readonly status: "active" | "archived";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface ProductPrice {
  readonly id: string;
  readonly variantId: string;
  readonly amountMinor: number;
  readonly currency: "VND";
  readonly validFrom: string;
  readonly validTo?: string;
  readonly createdBy: string;
}

export interface ProductMedia {
  readonly id: string;
  readonly productId: string;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  readonly byteSize: number;
  readonly altText: string;
  readonly sortOrder: number;
  readonly isPrimary: boolean;
  readonly previewUrl: string;
  readonly createdAt: string;
}

export interface CatalogAuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceType: "category" | "product" | "variant" | "price" | "media";
  readonly resourceId: string;
  readonly outcome: "success" | "failure" | "denied";
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}
