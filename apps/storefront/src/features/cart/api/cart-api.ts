// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiClient } from "../../../shared/http/api-client";
import { mutationHeaders } from "../../../shared/http/api-client";
import { cartEnvelopeSchema, guestEnvelopeSchema } from "../schemas/cart.schema";

export class CartApi {
  constructor(private readonly client: ApiClient) {}
  async get() { return (await this.client.request("/v1/storefront/cart", cartEnvelopeSchema)).data; }
  async createGuest() { return (await this.client.request("/v1/storefront/guest-sessions", guestEnvelopeSchema, { method: "POST", headers: mutationHeaders() })).data; }
  async add(variantId: string, quantity: number) { return (await this.client.request("/v1/storefront/cart/items", cartEnvelopeSchema, { method: "POST", headers: mutationHeaders(), body: JSON.stringify({ variantId, quantity }) })).data; }
  async update(itemId: string, quantity: number) { return (await this.client.request(`/v1/storefront/cart/items/${itemId}`, cartEnvelopeSchema, { method: "PATCH", headers: mutationHeaders(), body: JSON.stringify({ quantity }) })).data; }
  async remove(itemId: string) { return (await this.client.request(`/v1/storefront/cart/items/${itemId}`, cartEnvelopeSchema, { method: "DELETE", headers: mutationHeaders() })).data; }
  async checkoutReadiness() { return (await this.client.request("/v1/storefront/cart/checkout-readiness", cartEnvelopeSchema, { method: "POST", headers: mutationHeaders() })).data; }
  async inspectResolution() { return (await this.client.request("/v1/storefront/cart/resolution", zResolutionEnvelope)).data; }
  async resolve(action: "keep_guest" | "keep_saved" | "merge", idempotencyKey: string) { return this.client.request("/v1/storefront/cart/resolution", zResolutionEnvelope, { method: "POST", headers: mutationHeaders(), body: JSON.stringify({ action, idempotencyKey }) }); }
}

import { z } from "zod";
const zResolutionEnvelope = z.object({ success: z.literal(true), message: z.string(), data: z.object({ status: z.enum(["not_required", "required", "resolved"]), guestCart: cartEnvelopeSchema.shape.data.optional(), savedCart: cartEnvelopeSchema.shape.data.optional(), resultingCart: cartEnvelopeSchema.shape.data.optional() }) });
