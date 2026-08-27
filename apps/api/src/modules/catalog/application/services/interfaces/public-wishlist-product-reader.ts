// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PublicProductDto } from "../../dtos/responses/public-catalog-response.dto";

export interface PublicWishlistProductReader {
  getPublishedByIds(
    productIds: readonly string[],
  ): Promise<readonly PublicProductDto[]>;
}
