// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { FeaturedProductItem } from "../../domain/entities/email-campaign.entity";

export interface CatalogQueryPort {
  getLatestProducts(limit: number): Promise<FeaturedProductItem[]>;
  getProductsByIds(productIds: string[]): Promise<FeaturedProductItem[]>;
}
