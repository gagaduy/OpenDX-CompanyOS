// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import { paymentStatusEnvelopeSchema } from "../schemas/payment.schema";

export class PaymentApi {
  constructor(private readonly client: ApiClient) {}

  async getCheckoutStatus(checkoutId: string) {
    return (
      await this.client.request(
        `/v1/storefront/checkouts/${checkoutId}`,
        paymentStatusEnvelopeSchema,
      )
    ).data;
  }
}
