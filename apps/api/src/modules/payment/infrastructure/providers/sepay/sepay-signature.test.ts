// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { buildSePayCheckoutFields, signSePayFields } from "./sepay-signature";

describe("SePay checkout signature", () => {
  it("matches the documented field order and a fixed synthetic HMAC vector", () => {
    const unsigned = buildSePayCheckoutFields({
      amountVnd: 100_000,
      merchantId: "MERCHANT_123",
      description: "Order #12345",
      invoiceNumber: "NVC-PAY-A1000000000040008000000000000001",
      customerId: "customer-1",
      paymentMethod: "BANK_TRANSFER",
      successUrl: "https://example.com/payment/success",
      errorUrl: "https://example.com/payment/error",
      cancelUrl: "https://example.com/payment/cancel",
    });
    expect(unsigned.map(({ name }) => name)).toEqual([
      "order_amount", "merchant", "currency", "operation",
      "order_description", "order_invoice_number", "customer_id",
      "payment_method", "success_url", "error_url", "cancel_url",
    ]);
    expect(signSePayFields(unsigned, "synthetic-secret")).toBe("jdojHgsqjcI1ytVL/7eHqtGkaOrHzCrcxg7hF/AXpeI=");
  });
});
