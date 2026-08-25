// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface PublicProductListQuery {
  readonly query?: string;
  readonly category?: string;
  readonly stockStatus?: "in_stock" | "out_of_stock";
  readonly discountStatus?: "on_sale";
  readonly minPriceVnd?: number;
  readonly maxPriceVnd?: number;
  readonly sort?: "newest" | "best_selling" | "price_asc" | "price_desc" | "name_asc";
  readonly page: number;
  readonly pageSize: number;
}
