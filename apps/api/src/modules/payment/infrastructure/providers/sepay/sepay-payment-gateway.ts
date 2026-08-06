// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import { PaymentGatewayError, type CreateProviderCheckoutRequest, type NormalizedPaymentNotification, type PaymentGateway, type PaymentInitiation, type ProviderOrderDetail } from "../../../application/providers/payment-gateway";
import { buildSePayCheckoutFields, signSePayFields } from "./sepay-signature";

export interface SePayGatewayConfiguration {
  readonly checkoutUrl: string;
  readonly apiBaseUrl: string;
  readonly merchantId: string;
  readonly secretKey: string;
  readonly successUrl: string;
  readonly errorUrl: string;
  readonly cancelUrl: string;
  readonly requestTimeoutMs: number;
}
type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
const detailSchema = z.object({ data: z.object({
  order_id: z.string().min(1),
  order_invoice_number: z.string().min(1),
  order_status: z.string().min(1),
  order_amount: z.string().regex(/^\d+(?:\.0+)?$/),
  order_currency: z.literal("VND"),
  transactions: z.array(z.object({
    transaction_status: z.string(),
    transaction_amount: z.string().optional(),
    transaction_currency: z.string().optional(),
    card_number: z.string().optional(),
    card_holder_name: z.string().optional(),
    card_expiry: z.string().optional(),
  }).passthrough()).default([]),
}).passthrough() });
const notificationSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  notification_type: z.string().min(1),
  order: z.object({
    id: z.string().min(1), order_id: z.string().min(1), order_status: z.string().min(1),
    order_currency: z.string().min(1), order_amount: z.string().regex(/^\d+(?:\.0+)?$/),
    order_invoice_number: z.string().min(1),
  }).passthrough(),
  transaction: z.object({
    id: z.string().min(1), transaction_id: z.string().min(1), transaction_status: z.string().min(1),
    transaction_amount: z.string().optional(), transaction_currency: z.string().optional(),
  }).passthrough(),
  customer: z.unknown().optional(),
}).passthrough();

export class SePayPaymentGateway implements PaymentGateway {
  constructor(private readonly config: SePayGatewayConfiguration, private readonly fetcher: Fetch = fetch) {}

  async createCheckout(request: CreateProviderCheckoutRequest): Promise<PaymentInitiation> {
    const unsigned = buildSePayCheckoutFields({
      amountVnd: request.amountVnd,
      merchantId: this.config.merchantId,
      description: request.orderDescription,
      invoiceNumber: request.invoiceNumber,
      customerId: request.customerId,
      ...(request.paymentMethod === undefined ? {} : { paymentMethod: request.paymentMethod }),
      successUrl: this.config.successUrl,
      errorUrl: this.config.errorUrl,
      cancelUrl: this.config.cancelUrl,
    });
    return { actionUrl: this.config.checkoutUrl, method: "POST", fields: [...unsigned, { name: "signature", value: signSePayFields(unsigned, this.config.secretKey) }] };
  }

  async getOrderDetail(providerOrderId: string): Promise<ProviderOrderDetail> {
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.config.apiBaseUrl.replace(/\/$/, "")}/v1/order/detail/${encodeURIComponent(providerOrderId)}`,
        { method: "GET", headers: { authorization: `Basic ${Buffer.from(`${this.config.merchantId}:${this.config.secretKey}`).toString("base64")}`, accept: "application/json" }, signal: AbortSignal.timeout(this.config.requestTimeoutMs) },
      );
    } catch (error) {
      if (isAbort(error)) throw new PaymentGatewayError("timeout", "SePay request timed out");
      throw new PaymentGatewayError("provider_error", "SePay request failed");
    }
    if (response.status === 401 || response.status === 403) throw new PaymentGatewayError("unauthorized", "SePay authentication failed");
    if (response.status === 404) throw new PaymentGatewayError("not_found", "SePay order was not found");
    if (!response.ok) throw new PaymentGatewayError("provider_error", "SePay returned an unsuccessful response");
    try {
      const parsed = detailSchema.parse(await response.json()).data;
      const amountVnd = Number(parsed.order_amount);
      if (!Number.isSafeInteger(amountVnd)) throw new Error("unsafe amount");
      const approved = parsed.transactions.some(({ transaction_status }) => transaction_status === "APPROVED");
      return {
        providerOrderId: parsed.order_id,
        invoiceNumber: parsed.order_invoice_number,
        status: parsed.order_status,
        amountVnd,
        currency: "VND",
        transactionApproved: approved,
        redactedEvidence: {
          order_id: parsed.order_id,
          order_invoice_number: parsed.order_invoice_number,
          order_status: parsed.order_status,
          order_amount: parsed.order_amount,
          order_currency: parsed.order_currency,
          transaction_statuses: parsed.transactions.map(({ transaction_status }) => transaction_status),
        },
      };
    } catch (error) {
      if (error instanceof PaymentGatewayError) throw error;
      throw new PaymentGatewayError("invalid_response", "SePay response was invalid");
    }
  }

  normalizeNotification(payload: unknown): NormalizedPaymentNotification {
    try {
      const parsed = notificationSchema.parse(payload);
      const amountVnd = Number(parsed.order.order_amount);
      if (!Number.isSafeInteger(amountVnd)) throw new Error("unsafe amount");
      const paid = parsed.notification_type === "ORDER_PAID"
        && parsed.order.order_status === "CAPTURED"
        && parsed.transaction.transaction_status === "APPROVED";
      return {
        notificationType: parsed.notification_type,
        providerEventId: parsed.transaction.id,
        providerOrderId: parsed.order.order_id,
        providerTransactionId: parsed.transaction.transaction_id,
        invoiceNumber: parsed.order.order_invoice_number,
        orderStatus: parsed.order.order_status,
        transactionStatus: parsed.transaction.transaction_status,
        amountVnd,
        currency: parsed.order.order_currency,
        state: paid ? "paid" : "unsupported",
        redactedPayload: {
          timestamp: parsed.timestamp,
          notification_type: parsed.notification_type,
          order: {
            id: parsed.order.id, order_id: parsed.order.order_id,
            order_status: parsed.order.order_status, order_currency: parsed.order.order_currency,
            order_amount: parsed.order.order_amount, order_invoice_number: parsed.order.order_invoice_number,
          },
          transaction: {
            id: parsed.transaction.id, transaction_id: parsed.transaction.transaction_id,
            transaction_status: parsed.transaction.transaction_status,
            ...(parsed.transaction.transaction_amount === undefined ? {} : { transaction_amount: parsed.transaction.transaction_amount }),
            ...(parsed.transaction.transaction_currency === undefined ? {} : { transaction_currency: parsed.transaction.transaction_currency }),
          },
        },
      };
    } catch {
      throw new PaymentGatewayError("invalid_response", "SePay notification was invalid");
    }
  }
}
function isAbort(error: unknown): boolean { return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"); }
