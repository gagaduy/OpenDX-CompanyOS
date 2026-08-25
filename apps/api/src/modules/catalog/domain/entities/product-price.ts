// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Money } from "../value-objects/money";

export interface ProductPrice extends Money {
  readonly id: string;
  readonly variantId: string;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly createdBy: string;
}
