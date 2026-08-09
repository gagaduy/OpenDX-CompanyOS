// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SePayPaymentGateway } from "./sepay-payment-gateway";

const config = {
  checkoutUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
  apiBaseUrl: "https://pgapi-sandbox.sepay.vn",
  merchantId: "merchant-1",
  secretKey: "secret-1",
  successUrl: "https://example.com/success",
  errorUrl: "https://example.com/error",
  cancelUrl: "https://example.com/cancel",
  requestTimeoutMs: 1_000,
};

describe("SePayPaymentGateway", () => {
  it("returns ordered signed form fields without exposing the secret", async () => {
    const gateway = new SePayPaymentGateway(config, vi.fn());
    const result = await gateway.createCheckout({ amountVnd: 100_000, invoiceNumber: "NVC-PAY-A1000000000040008000000000000001", orderDescription: "Order NVC-1", customerId: "customer-1" });
    expect(result).toMatchObject({ actionUrl: config.checkoutUrl, method: "POST" });
    expect(result.fields.at(-1)?.name).toBe("signature");
    expect(JSON.stringify(result)).not.toContain(config.secretKey);
  });

  it("maps and redacts official-shaped order detail responses", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      requestInit = init;
      return new Response(JSON.stringify({ data: {
      order_id: "SEPAY-1", order_invoice_number: "NVC-PAY-A1000000000040008000000000000001",
      order_status: "CAPTURED", order_amount: "100000.00", order_currency: "VND",
      transactions: [{ transaction_status: "APPROVED", transaction_amount: "100000.00", transaction_currency: "VND", card_number: "512345xxxxxx0008", card_holder_name: "BUYER", card_expiry: "1230" }],
    } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await new SePayPaymentGateway(config, fetcher).getOrderDetail("SEPAY-1");
    expect(result).toMatchObject({ status: "CAPTURED", amountVnd: 100_000, transactionApproved: true });
    expect(JSON.stringify(result.redactedEvidence)).not.toMatch(/card_number|card_holder_name|card_expiry|BUYER|512345xxxxxx0008|1230/);
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Basic /);
    expect(JSON.stringify(result)).not.toContain(headers.authorization);
  });

  it("categorizes timeouts without secret-bearing errors", async () => {
    const fetcher = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
    await expect(new SePayPaymentGateway(config, fetcher).getOrderDetail("SEPAY-1")).rejects.toMatchObject({ category: "timeout", message: "SePay request timed out" });
  });

  it("normalizes official IPN fields while removing customer, network, and card data", () => {
    const result = new SePayPaymentGateway(config, vi.fn()).normalizeNotification({
      timestamp: 1757058220,
      notification_type: "ORDER_PAID",
      order: {
        id: "provider-event-1", order_id: "SEPAY-1", order_status: "CAPTURED",
        order_currency: "VND", order_amount: "100000.00",
        order_invoice_number: "NVC-PAY-A1000000000040008000000000000001",
        ip_address: "14.1.2.3", user_agent: "sensitive browser value",
      },
      transaction: {
        id: "event-transaction-1", transaction_id: "transaction-1",
        transaction_status: "APPROVED", transaction_amount: "100000",
        transaction_currency: "VND", card_number: "4111XXXXXXXX1111",
        card_holder_name: "BUYER", card_expiry: "12/26",
      },
      customer: { id: "provider-customer", customer_id: "customer-1", address: "sensitive address" },
    });

    expect(result).toMatchObject({
      state: "paid", providerOrderId: "SEPAY-1", providerTransactionId: "transaction-1",
      amountVnd: 100_000, currency: "VND",
    });
    expect(JSON.stringify(result.redactedPayload)).not.toMatch(/card|BUYER|12\/26|ip_address|14\.1\.2\.3|user_agent|browser|customer|address/i);
  });

  it("does not trust inconsistent transaction money evidence", () => {
    const gateway = new SePayPaymentGateway(config, vi.fn());
    const payload = {
      timestamp: 1757058220,
      notification_type: "ORDER_PAID",
      order: {
        id: "provider-event-1", order_id: "SEPAY-1", order_status: "CAPTURED",
        order_currency: "VND", order_amount: "100000",
        order_invoice_number: "NVC-PAY-A1000000000040008000000000000001",
      },
      transaction: {
        id: "event-transaction-1", transaction_id: "transaction-1",
        transaction_status: "APPROVED", transaction_amount: "99999",
        transaction_currency: "VND",
      },
    };
    expect(gateway.normalizeNotification(payload)).toMatchObject({
      state: "unsupported",
      amountVnd: 99_999,
      currency: "VND",
    });
  });

  it("requires an approved detail transaction to match order money", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: {
      order_id: "SEPAY-1",
      order_invoice_number: "NVC-PAY-A1000000000040008000000000000001",
      order_status: "CAPTURED",
      order_amount: "100000",
      order_currency: "VND",
      transactions: [{
        transaction_status: "APPROVED",
        transaction_amount: "99999",
        transaction_currency: "VND",
      }],
    } }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(
      new SePayPaymentGateway(config, fetcher).getOrderDetail("SEPAY-1"),
    ).resolves.toMatchObject({ transactionApproved: false });
  });
});
