// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type VariantStatus = "active" | "archived";
export type VariantOptions = Readonly<Record<string, string>>;

export interface ProductVariant {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly title: string;
  readonly optionValues: VariantOptions;
  readonly status: VariantStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
