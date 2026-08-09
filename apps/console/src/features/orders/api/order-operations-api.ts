// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ZodType } from "zod";
import { mapOrderDetail, mapOrderPage } from "../mappers/order.mapper";
import { errorEnvelopeSchema, orderDetailEnvelopeSchema, orderListEnvelopeSchema } from "../schemas/order-api.schema";
import type { OrderDetailView, OrderPageView, OrderQuery, OrderTransitionInput } from "../types/order.types";

export type OrderErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "ORDER_NOT_FOUND" | "STALE_VERSION" | "INVALID_ORDER_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "VALIDATION_ERROR" | "INVALID_RESPONSE" | "UNAVAILABLE";
export class OrderApiError extends Error { constructor(readonly code: OrderErrorCode, message: string) { super(message); this.name = "OrderApiError"; } }
export interface OrderOperationsApi {
  list(query: OrderQuery, signal?: AbortSignal): Promise<OrderPageView>;
  get(orderId: string, signal?: AbortSignal): Promise<OrderDetailView>;
  transition(orderId: string, input: OrderTransitionInput): Promise<OrderDetailView>;
}
export function createOrderOperationsApi(baseUrl: string, accessToken: string): OrderOperationsApi {
  const request = createRequest(baseUrl, accessToken);
  return {
    async list(query, signal) { const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) }); if (query.status) params.set("status", query.status); return mapOrderPage(parse(orderListEnvelopeSchema, await request(`/v1/admin/orders?${params}`, { signal })).data); },
    async get(orderId, signal) { return mapOrderDetail(parse(orderDetailEnvelopeSchema, await request(`/v1/admin/orders/${orderId}`, { signal })).data); },
    async transition(orderId, input) { return mapOrderDetail(parse(orderDetailEnvelopeSchema, await request(`/v1/admin/orders/${orderId}/transitions`, { method: "POST", headers: { "idempotency-key": `console:${crypto.randomUUID()}` }, body: JSON.stringify(input) })).data); },
  };
}
function createRequest(baseUrl: string, accessToken: string) {
  return async (path: string, init?: RequestInit): Promise<unknown> => {
    let response: Response;
    try { response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID(), ...init?.headers } }); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; throw new OrderApiError("UNAVAILABLE", "Order service is unavailable."); }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) { const parsed = errorEnvelopeSchema.safeParse(body); const code = parsed.success ? normalizeCode(parsed.data.errorCode) : normalizeStatus(response.status); throw new OrderApiError(code, message(code)); }
    return body;
  };
}
function parse<T>(schema: ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new OrderApiError("INVALID_RESPONSE", "The order service returned an invalid response."); return parsed.data; }
function normalizeCode(code: string): OrderErrorCode { return ["UNAUTHORIZED", "FORBIDDEN", "ORDER_NOT_FOUND", "STALE_VERSION", "INVALID_ORDER_TRANSITION", "IDEMPOTENCY_CONFLICT", "VALIDATION_ERROR"].includes(code) ? code as OrderErrorCode : "UNAVAILABLE"; }
function normalizeStatus(status: number): OrderErrorCode { return status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 409 ? "STALE_VERSION" : "UNAVAILABLE"; }
function message(code: OrderErrorCode): string { if (code === "STALE_VERSION") return "Refresh required before changing this order."; if (code === "FORBIDDEN") return "Permission denied."; if (code === "UNAUTHORIZED") return "Your session has expired."; if (code === "INVALID_ORDER_TRANSITION") return "This order can no longer move to that state."; return "The order request could not be completed."; }
