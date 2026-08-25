// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryItem } from "../entities/inventory-item";
import type {
  InventoryReservation,
  InventoryReservationTerminalStatus,
} from "../entities/inventory-reservation";
import { InventoryDomainError } from "../exceptions/inventory-domain.error";

export function availableQuantity(item: InventoryItem): number {
  assertNonNegativeSafeInteger(item.onHand);
  assertNonNegativeSafeInteger(item.reserved);
  const available = item.onHand - item.reserved;
  if (!Number.isSafeInteger(available) || available < 0) {
    throw new InventoryDomainError(
      "INVALID_INVENTORY_BALANCE",
      "Inventory availability cannot be negative",
    );
  }
  return available;
}

export function applyReceipt(
  item: InventoryItem,
  quantity: number,
  updatedAt: string,
): InventoryItem {
  assertPositiveQuantity(quantity, "INVALID_STOCK_QUANTITY");
  return updateBalance(item, item.onHand + quantity, item.reserved, updatedAt);
}

export function applyAdjustment(
  item: InventoryItem,
  delta: number,
  updatedAt: string,
): InventoryItem {
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new InventoryDomainError(
      "INVALID_STOCK_ADJUSTMENT",
      "Stock adjustment must be a non-zero safe integer",
    );
  }
  const nextOnHand = item.onHand + delta;
  if (!Number.isSafeInteger(nextOnHand) || nextOnHand < item.reserved) {
    throw new InventoryDomainError(
      "INVALID_STOCK_ADJUSTMENT",
      "Stock adjustment cannot reduce on-hand below reserved stock",
    );
  }
  return updateBalance(item, nextOnHand, item.reserved, updatedAt);
}

export function applyReservation(
  item: InventoryItem,
  quantity: number,
  updatedAt: string,
): InventoryItem {
  assertPositiveQuantity(quantity, "INVALID_RESERVATION_QUANTITY");
  if (availableQuantity(item) < quantity) {
    throw new InventoryDomainError(
      "INSUFFICIENT_STOCK",
      "Available stock is insufficient",
    );
  }
  return updateBalance(item, item.onHand, item.reserved + quantity, updatedAt);
}

export function applyRelease(
  item: InventoryItem,
  quantity: number,
  updatedAt: string,
): InventoryItem {
  assertHeldQuantity(item, quantity);
  return updateBalance(item, item.onHand, item.reserved - quantity, updatedAt);
}

export function applyConsume(
  item: InventoryItem,
  quantity: number,
  updatedAt: string,
): InventoryItem {
  assertHeldQuantity(item, quantity);
  return updateBalance(
    item,
    item.onHand - quantity,
    item.reserved - quantity,
    updatedAt,
  );
}

export function finalizeReservation(
  reservation: InventoryReservation,
  status: InventoryReservationTerminalStatus,
  finalizedAt: string,
): InventoryReservation {
  if (reservation.status !== "active") {
    throw new InventoryDomainError(
      "RESERVATION_ALREADY_FINALIZED",
      "Reservation has already reached a terminal state",
    );
  }
  return {
    ...reservation,
    status,
    finalizedAt,
    updatedAt: finalizedAt,
  };
}

function assertHeldQuantity(item: InventoryItem, quantity: number): void {
  assertPositiveQuantity(quantity, "INVALID_RESERVATION_QUANTITY");
  if (quantity > item.reserved || quantity > item.onHand) {
    throw new InventoryDomainError(
      "INVALID_RESERVATION_QUANTITY",
      "Quantity exceeds held stock",
    );
  }
}

function assertPositiveQuantity(
  quantity: number,
  code: "INVALID_RESERVATION_QUANTITY" | "INVALID_STOCK_QUANTITY",
): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new InventoryDomainError(code, "Quantity must be a positive safe integer");
  }
}

function assertNonNegativeSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InventoryDomainError(
      "INVALID_INVENTORY_BALANCE",
      "Inventory quantity must be a non-negative safe integer",
    );
  }
}

function updateBalance(
  item: InventoryItem,
  onHand: number,
  reserved: number,
  updatedAt: string,
): InventoryItem {
  const updated: InventoryItem = {
    ...item,
    onHand,
    reserved,
    version: item.version + 1,
    updatedAt,
  };
  availableQuantity(updated);
  return updated;
}
