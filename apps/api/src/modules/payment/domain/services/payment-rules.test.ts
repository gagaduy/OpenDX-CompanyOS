// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Payment } from "../entities/payment";
import type { PaymentAttempt } from "../entities/payment-attempt";
import { createProviderInvoiceNumber, transitionPayment, transitionPaymentAttempt } from "./payment-rules";

const now = "2026-08-06T08:00:00.000Z";
const payment: Payment = { id: "payment-1", orderId: "order-1", provider: "sepay", expectedAmountVnd: 100_000, currency: "VND", status: "created", version: 1, createdAt: now, updatedAt: now };
const attempt: PaymentAttempt = { id: "a1000000-0000-4000-8000-000000000001", paymentId: payment.id, providerInvoiceNumber: "NVC-PAY-A1000000000040008000000000000001", state: "created", idempotencyKey: "pay-1", expiresAt: "2026-08-06T08:15:00.000Z", createdAt: now, updatedAt: now };

describe("payment rules", () => {
  it("creates a stable provider invoice from a UUID", () => {
    expect(createProviderInvoiceNumber(attempt.id)).toBe("NVC-PAY-A1000000000040008000000000000001");
  });

  it("transitions payment and attempt to pending then paid", () => {
    const pendingPayment = transitionPayment(payment, "pending_provider", now);
    const pendingAttempt = transitionPaymentAttempt(attempt, "pending_provider", now);
    expect(transitionPayment(pendingPayment, "paid", now)).toMatchObject({ status: "paid", paidAt: now, version: 3 });
    expect(transitionPaymentAttempt(pendingAttempt, "paid", now)).toMatchObject({ state: "paid" });
  });

  it.each([
    ["paid", "failed"],
    ["expired", "paid"],
    ["failed", "pending_provider"],
  ] as const)("rejects terminal payment transition %s -> %s", (status, target) => {
    expect(() => transitionPayment({ ...payment, status }, target, now)).toThrowError(expect.objectContaining({ code: "INVALID_PAYMENT_TRANSITION" }));
    expect(() => transitionPaymentAttempt({ ...attempt, state: status }, target, now)).toThrowError(expect.objectContaining({ code: "INVALID_PAYMENT_TRANSITION" }));
  });
});
