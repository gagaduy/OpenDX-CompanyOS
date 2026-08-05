// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../entities/inventory-item";
import type { InventoryReservation } from "../entities/inventory-reservation";
import {
  applyAdjustment,
  applyConsume,
  applyReceipt,
  applyRelease,
  applyReservation,
  availableQuantity,
  finalizeReservation,
} from "./inventory-rules";

const NOW = "2026-08-05T00:00:00.000Z";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "71000000-0000-4000-8000-000000000001",
    variantId: "72000000-0000-4000-8000-000000000001",
    onHand: 5,
    reserved: 2,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function reservation(
  overrides: Partial<InventoryReservation> = {},
): InventoryReservation {
  return {
    id: "73000000-0000-4000-8000-000000000001",
    referenceType: "checkout",
    referenceId: "checkout-1",
    variantId: "72000000-0000-4000-8000-000000000001",
    quantity: 2,
    status: "active",
    expiresAt: "2026-08-05T00:15:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("inventory rules", () => {
  it("computes available stock and rejects an invalid persisted balance", () => {
    expect(availableQuantity(item())).toBe(3);
    expect(() => availableQuantity(item({ onHand: 1, reserved: 2 }))).toThrowError(
      expect.objectContaining({ code: "INVALID_INVENTORY_BALANCE" }),
    );
  });

  it("receives a positive safe-integer quantity", () => {
    expect(applyReceipt(item(), 3, NOW)).toMatchObject({
      onHand: 8,
      reserved: 2,
      version: 2,
      updatedAt: NOW,
    });
    expect(() => applyReceipt(item(), 0, NOW)).toThrowError(
      expect.objectContaining({ code: "INVALID_STOCK_QUANTITY" }),
    );
  });

  it("rejects adjustments that would reduce on-hand below reserved", () => {
    expect(applyAdjustment(item(), -3, NOW)).toMatchObject({
      onHand: 2,
      reserved: 2,
      version: 2,
    });
    expect(() => applyAdjustment(item(), -4, NOW)).toThrowError(
      expect.objectContaining({ code: "INVALID_STOCK_ADJUSTMENT" }),
    );
    expect(() => applyAdjustment(item(), 0, NOW)).toThrowError(
      expect.objectContaining({ code: "INVALID_STOCK_ADJUSTMENT" }),
    );
  });

  it("reserves only available stock", () => {
    expect(applyReservation(item(), 3, NOW)).toMatchObject({
      onHand: 5,
      reserved: 5,
      version: 2,
    });
    expect(() => applyReservation(item(), 4, NOW)).toThrowError(
      expect.objectContaining({ code: "INSUFFICIENT_STOCK" }),
    );
  });

  it("releases held stock without changing on-hand", () => {
    expect(applyRelease(item(), 2, NOW)).toMatchObject({
      onHand: 5,
      reserved: 0,
      version: 2,
    });
    expect(() => applyRelease(item(), 3, NOW)).toThrowError(
      expect.objectContaining({ code: "INVALID_RESERVATION_QUANTITY" }),
    );
  });

  it("consumes held stock from on-hand and reserved together", () => {
    expect(applyConsume(item(), 2, NOW)).toMatchObject({
      onHand: 3,
      reserved: 0,
      version: 2,
    });
  });

  it("allows an active reservation to reach one terminal state", () => {
    expect(finalizeReservation(reservation(), "expired", NOW)).toMatchObject({
      status: "expired",
      finalizedAt: NOW,
      updatedAt: NOW,
    });
    expect(() =>
      finalizeReservation(
        reservation({ status: "released", finalizedAt: NOW }),
        "consumed",
        NOW,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "RESERVATION_ALREADY_FINALIZED" }),
    );
  });
});
