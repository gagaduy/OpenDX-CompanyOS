// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { CheckoutRepository } from "../../repositories/interfaces/checkout.repository";
import { CheckoutExpiryService } from "./checkout-expiry.service";

const now = "2026-08-06T08:16:00.000Z";
const session: DatabaseSession = { query: vi.fn() };
const dueCheckout = {
  id: "checkout-1", customerId: "customer-1", sourceCartId: "cart-1",
  sourceCartVersion: 1, addressSnapshot: {}, contactSnapshot: {}, subtotalVnd: 100_000,
  discountVnd: 0, totalVnd: 100_000, currency: "VND" as const,
  taxMode: "included_not_separated" as const, status: "order_created" as const,
  idempotencyKey: "key", requestFingerprint: "fingerprint", orderId: "order-1",
  expiresAt: "2026-08-06T08:15:00.000Z", createdAt: now, updatedAt: now,
};

function fixture(paymentResult: "expired" | "paid" = "expired") {
  const repository: CheckoutRepository = {
    create: vi.fn(), findByCustomerAndKey: vi.fn(), findByCartSnapshot: vi.fn(), findOwnedById: vi.fn(),
    applyPromotion: vi.fn(), attachOrder: vi.fn(), completePaid: vi.fn(),
    listDue: vi.fn(async () => [dueCheckout]), markExpired: vi.fn(async () => true),
    markCanceled: vi.fn(async () => true),
    appendAudit: vi.fn(),
  };
  const payments = {
    expireByOrderInSession: vi.fn(async () => paymentResult),
    cancelByOrderInSession: vi.fn(),
  };
  const orders = { createPending: vi.fn(), transitionInSession: vi.fn() };
  const inventory = { reserveInSession: vi.fn(), releaseInSession: vi.fn(), consumeInSession: vi.fn() };
  const promotions = { hold: vi.fn(), commit: vi.fn(), release: vi.fn() };
  const transactions: TransactionRunner = {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
  };
  const service = new CheckoutExpiryService(
    repository, payments, orders, inventory, promotions, transactions,
    () => "audit-1", () => now,
  );
  return { inventory, orders, payments, promotions, repository, service };
}

describe("CheckoutExpiryService", () => {
  it("expires unpaid checkout resources in lock-order sequence", async () => {
    const current = fixture();
    await expect(current.service.expireDue(100)).resolves.toBe(1);
    expect(current.payments.expireByOrderInSession).toHaveBeenCalledOnce();
    expect(current.orders.transitionInSession).toHaveBeenCalledWith(
      session, "order-1", "expired", "system", "system:checkout-expiry",
      "PAYMENT_WINDOW_EXPIRED", "checkout-expiry:checkout-1",
      "checkout-expiry:checkout-1", now,
    );
    expect(current.inventory.releaseInSession).toHaveBeenCalledOnce();
    expect(current.promotions.release).toHaveBeenCalledOnce();
    expect(current.repository.markExpired).toHaveBeenCalledOnce();
  });

  it("leaves checkout resources untouched when payment won the race", async () => {
    const current = fixture("paid");
    await expect(current.service.expireDue(100)).resolves.toBe(0);
    expect(current.orders.transitionInSession).not.toHaveBeenCalled();
    expect(current.inventory.releaseInSession).not.toHaveBeenCalled();
    expect(current.repository.markExpired).not.toHaveBeenCalled();
  });

  it("rejects unbounded expiry batches", async () => {
    await expect(fixture().service.expireDue(101)).rejects.toThrow(
      "Invalid checkout expiry batch limit",
    );
  });
});
