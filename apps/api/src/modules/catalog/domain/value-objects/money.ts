// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { CatalogDomainError } from "../exceptions/catalog-domain.error";

export interface Money {
  readonly amountMinor: number;
  readonly currency: "VND";
  readonly taxInclusive: true;
}

export function createMoney(amountMinor: number, currency: "VND"): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new CatalogDomainError(
      "VND amountMinor must be a positive safe integer",
    );
  }

  return { amountMinor, currency, taxInclusive: true };
}
