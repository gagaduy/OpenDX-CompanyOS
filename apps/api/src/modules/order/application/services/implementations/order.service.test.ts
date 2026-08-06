// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Order } from "../../../domain/entities/order";
import type { OrderLine } from "../../../domain/entities/order-line";
import type { OrderStatusHistory } from "../../../domain/entities/order-status-history";
import type { OrderRepository } from "../../repositories/interfaces/order.repository";
import { OrderService } from "./order.service";

const now = "2026-08-06T08:00:00.000Z";
const session: DatabaseSession = { query: vi.fn() };
const order: Order = {
  id: "order-1", publicNumber: "NVC-20260806-A1B2C3D4", customerId: "customer-1", checkoutId: "checkout-1",
  addressSnapshot: { addressId: "address-1", recipientName: "Buyer", phoneNumber: "0901", addressLine: "1 Street", ward: "Ward", provinceOrCity: "City", version: 1 },
  contactSnapshot: { email: "buyer@example.com" }, subtotalVnd: 100_000, discountVnd: 0, totalVnd: 100_000,
  currency: "VND", taxMode: "included_not_separated", status: "paid", reservationExpiresAt: "2026-08-06T08:15:00.000Z",
  paidAt: now, version: 1, createdAt: now, updatedAt: now,
};
const line: OrderLine = { id: "line-1", orderId: order.id, variantId: "variant-1", sku: "NOVA", productTitle: "Phone", variantLabel: "128 GB", quantity: 1, unitPriceVnd: 100_000, discountAllocationVnd: 0, lineTotalVnd: 100_000, linePosition: 0 };

function fixture() {
  let current = order;
  const history: OrderStatusHistory[] = [];
  const repository = {
    findById: vi.fn(async () => ({ order: current, lines: [line], history })),
    listForCustomer: vi.fn(async () => ({ items: [], totalItems: 0 })),
    listForStaff: vi.fn(async () => ({ items: [], totalItems: 0 })),
    findHistoryByIdempotencyKey: vi.fn(async (_session, _id, key) => history.find((entry) => entry.idempotencyKey === key)),
    updateStatus: vi.fn(async (_session, updated, version) => {
      if (current.version !== version) return false;
      current = updated;
      return true;
    }),
    appendHistory: vi.fn(async (_session, entry) => { history.push(entry); }),
    appendAudit: vi.fn(async () => undefined),
  } as unknown as OrderRepository;
  const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
  let id = 0;
  const service = new OrderService(repository, transactions, () => `id-${++id}`, () => now);
  return { repository, service };
}

describe("OrderService", () => {
  it("enforces staff roles, versions, and idempotent transitions", async () => {
    const { repository, service } = fixture();
    const denied = { actorId: "finance", roles: ["finance_operator"] as const, correlationId: "corr-denied" };
    await expect(service.transition(order.id, { targetStatus: "processing", reasonCode: "START", version: 1, idempotencyKey: "start-1" }, denied)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const allowed = { actorId: "ops", roles: ["operations_manager"] as const, correlationId: "corr-start" };
    const request = { targetStatus: "processing" as const, reasonCode: "START", version: 1, idempotencyKey: "start-1" };
    await expect(service.transition(order.id, request, allowed)).resolves.toMatchObject({ status: "processing", version: 2 });
    await expect(service.transition(order.id, request, allowed)).resolves.toMatchObject({ status: "processing", version: 2 });
    await expect(service.transition(order.id, {
      targetStatus: "ready_for_fulfillment", reasonCode: "READY",
      version: 1, idempotencyKey: "ready-1",
    }, allowed)).rejects.toMatchObject({ code: "STALE_VERSION" });
    expect(repository.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("constrains customer detail reads by owner", async () => {
    const { repository, service } = fixture();
    await expect(service.getForCustomer("other-customer", order.id)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    await expect(service.getForCustomer("customer-1", order.id)).resolves.not.toHaveProperty("customerId");
    expect(repository.findById).toHaveBeenCalledWith(session, order.id);
  });
});
