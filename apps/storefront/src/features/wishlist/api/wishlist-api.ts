// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import { mutationHeaders } from "../../../shared/http/api-client";
import {
  wishlistEnvelopeSchema,
  wishlistMutationEnvelopeSchema,
} from "../schemas/wishlist.schema";
import type { WishlistPage } from "../types/wishlist.types";

export class WishlistApi {
  constructor(private readonly client: ApiClient) {}

  async list(page = 1, pageSize = 24): Promise<WishlistPage> {
    const result = await this.client.request(
      `/v1/storefront/account/wishlist?page=${page}&pageSize=${pageSize}`,
      wishlistEnvelopeSchema,
    );
    return { items: result.data, ...result.meta };
  }

  async add(productId: string) {
    return (
      await this.client.request(
        `/v1/storefront/account/wishlist/items/${encodeURIComponent(productId)}`,
        wishlistMutationEnvelopeSchema,
        { method: "PUT", headers: mutationHeaders() },
      )
    ).data;
  }

  async remove(productId: string) {
    return (
      await this.client.request(
        `/v1/storefront/account/wishlist/items/${encodeURIComponent(productId)}`,
        wishlistMutationEnvelopeSchema,
        { method: "DELETE", headers: mutationHeaders() },
      )
    ).data;
  }
}
