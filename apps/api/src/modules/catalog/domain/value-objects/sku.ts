// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { CatalogDomainError } from "../exceptions/catalog-domain.error";

export function normalizeSku(value: string): string {
  const sku = value.trim().replace(/\s+/g, " ").toUpperCase();
  if (sku.length === 0) {
    throw new CatalogDomainError("SKU is required");
  }
  return sku;
}
