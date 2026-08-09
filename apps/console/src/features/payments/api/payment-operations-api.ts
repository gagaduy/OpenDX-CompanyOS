// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ZodType } from "zod";
import { mapPaymentDetail, mapPaymentPage } from "../mappers/payment.mapper";
import { errorEnvelopeSchema, paymentDetailEnvelopeSchema, paymentListEnvelopeSchema } from "../schemas/payment-api.schema";
import type { PaymentDetailView, PaymentPageView, PaymentQuery } from "../types/payment.types";

export type PaymentErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "PAYMENT_NOT_FOUND" | "PAYMENT_PROVIDER_NOT_CONFIGURED" | "VALIDATION_ERROR" | "INVALID_RESPONSE" | "UNAVAILABLE";
export class PaymentApiError extends Error { constructor(readonly code: PaymentErrorCode, message: string) { super(message); this.name = "PaymentApiError"; } }
export interface PaymentOperationsApi { list(query: PaymentQuery, signal?: AbortSignal): Promise<PaymentPageView>; get(paymentId: string, signal?: AbortSignal): Promise<PaymentDetailView>; reconcile(paymentId: string, input: { readonly providerOrderId?: string }): Promise<PaymentDetailView>; }
export function createPaymentOperationsApi(baseUrl: string, accessToken: string): PaymentOperationsApi {
  const request = createRequest(baseUrl, accessToken);
  return {
    async list(query, signal) { const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) }); if (query.status) params.set("status", query.status); return mapPaymentPage(parse(paymentListEnvelopeSchema, await request(`/v1/admin/payments?${params}`, { signal })).data); },
    async get(paymentId, signal) { return mapPaymentDetail(parse(paymentDetailEnvelopeSchema, await request(`/v1/admin/payments/${paymentId}`, { signal })).data); },
    async reconcile(paymentId, input) { return mapPaymentDetail(parse(paymentDetailEnvelopeSchema, await request(`/v1/admin/payments/${paymentId}/reconciliations`, { method: "POST", body: JSON.stringify(input) })).data); },
  };
}
function createRequest(baseUrl: string, accessToken: string) { return async (path: string, init?: RequestInit): Promise<unknown> => { let response: Response; try { response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, "x-correlation-id": crypto.randomUUID(), ...init?.headers } }); } catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; throw new PaymentApiError("UNAVAILABLE", "Payment service is unavailable."); } const body: unknown = await response.json().catch(() => undefined); if (!response.ok) { const parsed = errorEnvelopeSchema.safeParse(body); const code = parsed.success ? normalizeCode(parsed.data.errorCode) : normalizeStatus(response.status); throw new PaymentApiError(code, message(code)); } return body; }; }
function parse<T>(schema: ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new PaymentApiError("INVALID_RESPONSE", "The payment service returned an invalid response."); return parsed.data; }
function normalizeCode(code: string): PaymentErrorCode { return ["UNAUTHORIZED", "FORBIDDEN", "PAYMENT_NOT_FOUND", "PAYMENT_PROVIDER_NOT_CONFIGURED", "VALIDATION_ERROR"].includes(code) ? code as PaymentErrorCode : "UNAVAILABLE"; }
function normalizeStatus(status: number): PaymentErrorCode { return status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "UNAVAILABLE"; }
function message(code: PaymentErrorCode): string { if (code === "FORBIDDEN") return "Permission denied."; if (code === "UNAUTHORIZED") return "Your session has expired."; if (code === "PAYMENT_PROVIDER_NOT_CONFIGURED") return "SePay is not configured for reconciliation."; return "The payment request could not be completed."; }
