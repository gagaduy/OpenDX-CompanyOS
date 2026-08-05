// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryAvailability } from "../../dtos/inventory.dto";

export interface InventoryAvailabilityReader {
  getByVariantIds(
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, InventoryAvailability>>;
}
