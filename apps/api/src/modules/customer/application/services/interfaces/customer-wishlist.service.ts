// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  WishlistMutationDto,
  WishlistPageDto,
} from "../../dtos/customer.dto";

export interface WishlistPageQuery {
  readonly page: number;
  readonly pageSize: number;
}

export interface CustomerWishlistServiceContract {
  list(customerId: string, query: WishlistPageQuery): Promise<WishlistPageDto>;
  add(customerId: string, productId: string): Promise<WishlistMutationDto>;
  remove(customerId: string, productId: string): Promise<WishlistMutationDto>;
}
