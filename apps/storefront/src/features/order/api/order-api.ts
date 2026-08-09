// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import {
  orderDetailEnvelopeSchema,
  orderListEnvelopeSchema,
} from "../schemas/order.schema";

export class OrderApi {
  constructor(private readonly client: ApiClient) {}

  async list(page = 1) {
    return (
      await this.client.request(
        `/v1/storefront/orders?page=${page}&pageSize=20`,
        orderListEnvelopeSchema,
      )
    ).data;
  }

  async get(orderId: string) {
    return (
      await this.client.request(
        `/v1/storefront/orders/${orderId}`,
        orderDetailEnvelopeSchema,
      )
    ).data;
  }
}
