// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VariantOptions } from "../../../domain/entities/product-variant";

export interface CreateVariantRequestDto {
  readonly sku: string;
  readonly title: string;
  readonly optionValues: VariantOptions;
}

export interface UpdateVariantRequestDto {
  readonly sku?: string;
  readonly title?: string;
  readonly optionValues?: VariantOptions;
  readonly version: number;
}

export interface ReplacePriceRequestDto {
  readonly amountMinor: number;
  readonly currency: "VND";
}
