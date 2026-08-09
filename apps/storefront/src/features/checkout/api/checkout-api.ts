// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import { mutationHeaders } from "../../../shared/http/api-client";
import {
  checkoutCreationEnvelopeSchema,
  checkoutEnvelopeSchema,
  paymentInitiationEnvelopeSchema,
} from "../schemas/checkout.schema";
import type { CreateCheckoutInput } from "../types/checkout.types";

export class CheckoutApi {
  constructor(private readonly client: ApiClient) {}

  async create(input: CreateCheckoutInput, idempotencyKey: string) {
    return (
      await this.client.request(
        "/v1/storefront/checkouts",
        checkoutCreationEnvelopeSchema,
        {
          method: "POST",
          headers: { ...mutationHeaders(), "idempotency-key": idempotencyKey },
          body: JSON.stringify(input),
        },
      )
    ).data;
  }

  async get(checkoutId: string) {
    return (
      await this.client.request(
        `/v1/storefront/checkouts/${checkoutId}`,
        checkoutEnvelopeSchema,
      )
    ).data;
  }

  async initiatePayment(checkoutId: string) {
    return (
      await this.client.request(
        `/v1/storefront/checkouts/${checkoutId}/payment-initiation`,
        paymentInitiationEnvelopeSchema,
        { method: "POST", headers: mutationHeaders() },
      )
    ).data;
  }
}
