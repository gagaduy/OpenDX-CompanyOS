// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CatalogStatus = "active" | "draft" | "archived";
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
  readonly status: "draft" | "archived";
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
  readonly status: "draft" | "archived";
  readonly primaryMediaId?: string;
  readonly variantCount: number;
  readonly minimumPrice?: number;
  readonly maximumPrice?: number;
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
  readonly status?: "draft" | "archived";
  readonly page: number;
  readonly pageSize: number;
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
