// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type ProductStatus = "draft" | "published" | "archived";
export type ProductAttributeValue = string | number | boolean | readonly string[];
export type ProductAttributes = Readonly<Record<string, ProductAttributeValue>>;

export interface Product {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly slug: string;
  readonly brand?: string;
  readonly description: string;
  readonly attributes: ProductAttributes;
  readonly status: ProductStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
