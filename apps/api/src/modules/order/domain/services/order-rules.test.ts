// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Order } from "../entities/order";
import type { OrderLine } from "../entities/order-line";
import { createPublicOrderNumber, transitionOrder, validateOrderSnapshot } from "./order-rules";

const timestamp = "2026-08-06T08:00:00.000Z";
const order: Order = {
  id: "order-1", publicNumber: "NVC-20260806-A1B2C3D4",
  customerId: "customer-1", checkoutId: "checkout-1",
  addressSnapshot: { addressId: "address-1", recipientName: "Nova Buyer", phoneNumber: "0901234567", addressLine: "1 Nguyen Hue", ward: "Ben Nghe", provinceOrCity: "Ho Chi Minh City", version: 1 },
  contactSnapshot: { email: "buyer@example.com", fullName: "Nova Buyer" },
  promotionCode: "NOVA10", subtotalVnd: 1_000_000, discountVnd: 100_000,
  totalVnd: 900_000, currency: "VND", taxMode: "included_not_separated",
  status: "pending_payment", reservationExpiresAt: "2026-08-06T08:15:00.000Z",
  version: 1, createdAt: timestamp, updatedAt: timestamp,
};
const lines: readonly OrderLine[] = [{
  id: "line-1", orderId: order.id, variantId: "variant-1", sku: "NOVA-1",
  productTitle: "Nova Phone", variantLabel: "128 GB", quantity: 1,
  unitPriceVnd: 1_000_000, discountAllocationVnd: 100_000,
  lineTotalVnd: 900_000, linePosition: 0,
}];

describe("order rules", () => {
  it("validates immutable snapshots and exact totals", () => {
    expect(() => validateOrderSnapshot(order, lines)).not.toThrow();
    expect(() => validateOrderSnapshot({ ...order, totalVnd: 899_999 }, lines)).toThrowError(expect.objectContaining({ code: "INVALID_ORDER" }));
    expect(() => validateOrderSnapshot(order, [{ ...lines[0]!, lineTotalVnd: 899_999 }])).toThrowError(expect.objectContaining({ code: "INVALID_ORDER" }));
  });

  it.each([
    ["pending_payment", "paid", "provider"],
    ["pending_payment", "canceled", "customer"],
    ["pending_payment", "expired", "system"],
    ["paid", "processing", "staff"],
    ["processing", "ready_for_fulfillment", "staff"],
    ["ready_for_fulfillment", "completed", "staff"],
  ] as const)("allows %s -> %s by %s", (status, target, actorType) => {
    expect(transitionOrder({ ...order, status }, target, actorType, timestamp)).toMatchObject({ status: target, version: 2 });
  });

  it.each([
    ["paid", "canceled", "staff"],
    ["pending_payment", "processing", "staff"],
    ["paid", "completed", "staff"],
    ["pending_payment", "paid", "staff"],
    ["processing", "ready_for_fulfillment", "customer"],
  ] as const)("rejects %s -> %s by %s", (status, target, actorType) => {
    expect(() => transitionOrder({ ...order, status }, target, actorType, timestamp)).toThrowError(expect.objectContaining({ code: "INVALID_ORDER_TRANSITION" }));
  });

  it("creates the stable public order number format", () => {
    expect(createPublicOrderNumber(timestamp, "a1b2c3d4")).toBe("NVC-20260806-A1B2C3D4");
  });
});
