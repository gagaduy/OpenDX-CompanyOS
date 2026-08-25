// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import { mutationHeaders } from "../../../shared/http/api-client";
import {
  addressEnvelopeSchema,
  addressesEnvelopeSchema,
  emptyEnvelopeSchema,
  profileEnvelopeSchema,
} from "../schemas/customer-account.schema";
import type { AddressInput } from "../types/customer-account.types";
export class CustomerAccountApi {
  constructor(private readonly client: ApiClient) {}
  async profile() {
    return (
      await this.client.request("/v1/storefront/account", profileEnvelopeSchema)
    ).data;
  }
  async updateProfile(input: {
    fullName?: string;
    phoneNumber?: string;
    version: number;
  }) {
    return (
      await this.client.request(
        "/v1/storefront/account",
        profileEnvelopeSchema,
        {
          method: "PATCH",
          headers: mutationHeaders(),
          body: JSON.stringify(input),
        },
      )
    ).data;
  }
  async addresses() {
    return (
      await this.client.request(
        "/v1/storefront/account/addresses",
        addressesEnvelopeSchema,
      )
    ).data;
  }
  async createAddress(input: AddressInput) {
    return (
      await this.client.request(
        "/v1/storefront/account/addresses",
        addressEnvelopeSchema,
        {
          method: "POST",
          headers: mutationHeaders(),
          body: JSON.stringify(input),
        },
      )
    ).data;
  }
  async updateAddress(id: string, input: AddressInput & { version: number }) {
    return (
      await this.client.request(
        `/v1/storefront/account/addresses/${id}`,
        addressEnvelopeSchema,
        {
          method: "PATCH",
          headers: mutationHeaders(),
          body: JSON.stringify(input),
        },
      )
    ).data;
  }
  async removeAddress(id: string) {
    await this.client.request(
      `/v1/storefront/account/addresses/${id}`,
      emptyEnvelopeSchema,
      { method: "DELETE", headers: mutationHeaders() },
    );
  }
  async setDefault(id: string) {
    await this.client.request(
      `/v1/storefront/account/addresses/${id}/default`,
      emptyEnvelopeSchema,
      { method: "POST", headers: mutationHeaders() },
    );
  }
}
