// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import { CheckoutCancellationService } from "./checkout-cancellation.service";

const session = {} as DatabaseSession;
const request = {
  orderId: "order-1",
  expectedVersion: 1,
  actorId: "ops-1",
  reasonCode: "CUSTOMER_REQUEST",
  idempotencyKey: "cancel-1",
  correlationId: "corr-1",
  now: "2026-08-06T08:05:00.000Z",
};

function fixture(paymentResult: "canceled" | "already_canceled" | "paid" | "already_terminal" = "canceled") {
  const repository = {
    markCanceled: vi.fn(async () => true),
    appendAudit: vi.fn(),
  };
  const payments = {
    cancelByOrderInSession: vi.fn(async () => paymentResult),
  };
  const orders = {
    transitionInSession: vi.fn(async () => ({
      id: "order-1",
      checkoutId: "checkout-1",
    })),
  };
  const inventory = { releaseInSession: vi.fn() };
  const promotions = { release: vi.fn() };
  const service = new CheckoutCancellationService(
    repository as never,
    payments as never,
    orders as never,
    inventory as never,
    promotions as never,
    () => "audit-1",
  );
  return { inventory, orders, payments, promotions, repository, service };
}

describe("CheckoutCancellationService", () => {
  it("cancels payment before releasing all pending checkout resources", async () => {
    const current = fixture();
    await expect(current.service.cancelInSession(session, request)).resolves.toBe("canceled");
    expect(current.payments.cancelByOrderInSession).toHaveBeenCalledOnce();
    expect(current.orders.transitionInSession).toHaveBeenCalledWith(
      session,
      "order-1",
      "canceled",
      "staff",
      "ops-1",
      "CUSTOMER_REQUEST",
      "cancel-1",
      "corr-1",
      request.now,
      1,
    );
    expect(current.inventory.releaseInSession).toHaveBeenCalledOnce();
    expect(current.promotions.release).toHaveBeenCalledOnce();
    expect(current.repository.markCanceled).toHaveBeenCalledOnce();
    expect(current.repository.appendAudit).toHaveBeenCalledOnce();
    expect(current.payments.cancelByOrderInSession.mock.invocationCallOrder[0]).toBeLessThan(
      current.orders.transitionInSession.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ["paid", "already_paid"],
    ["already_terminal", "not_cancelable"],
  ] as const)("stops when payment is %s", async (payment, result) => {
    const current = fixture(payment);
    await expect(current.service.cancelInSession(session, request)).resolves.toBe(result);
    expect(current.orders.transitionInSession).not.toHaveBeenCalled();
    expect(current.inventory.releaseInSession).not.toHaveBeenCalled();
    expect(current.repository.markCanceled).not.toHaveBeenCalled();
  });

  it("returns an idempotent success without repeating cancellation effects", async () => {
    const current = fixture("already_canceled");
    await expect(current.service.cancelInSession(session, request)).resolves.toBe("canceled");
    expect(current.orders.transitionInSession).not.toHaveBeenCalled();
    expect(current.inventory.releaseInSession).not.toHaveBeenCalled();
    expect(current.promotions.release).not.toHaveBeenCalled();
    expect(current.repository.appendAudit).not.toHaveBeenCalled();
  });
});
