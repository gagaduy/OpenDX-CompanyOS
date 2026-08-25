// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface CatalogVariantSummary {
  readonly id: string;
  readonly sku: string;
  readonly status: "active" | "archived";
}

export interface CatalogVariantReader {
  findById(
    session: DatabaseSession,
    variantId: string,
  ): Promise<CatalogVariantSummary | undefined>;
}
