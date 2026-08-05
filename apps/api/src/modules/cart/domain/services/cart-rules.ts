// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Cart } from "../entities/cart";
import type { CartItem } from "../entities/cart-item";
import { CartDomainError } from "../exceptions/cart-domain.error";

export function assertCartOwner(cart: Cart): void {
  if ((cart.guestSessionId === undefined) === (cart.customerId === undefined))
    throw new CartDomainError(
      "INVALID_CART_OWNER",
      "Cart must have exactly one owner",
    );
}
export function validateCartItem(item: CartItem): CartItem {
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
    throw new CartDomainError(
      "INVALID_CART_QUANTITY",
      "Quantity must be a positive safe integer",
    );
  if (
    !Number.isSafeInteger(item.lastValidatedUnitPriceVnd) ||
    item.lastValidatedUnitPriceVnd < 0
  )
    throw new CartDomainError(
      "INVALID_CART_PRICE",
      "Price must be a non-negative safe integer",
    );
  return item;
}
export function lineSubtotal(quantity: number, unitPriceVnd: number): number {
  const total = quantity * unitPriceVnd;
  if (!Number.isSafeInteger(total) || total < 0)
    throw new CartDomainError(
      "CART_TOTAL_OVERFLOW",
      "Cart total exceeds safe integer range",
    );
  return total;
}
export function cartTotal(
  lines: readonly {
    readonly quantity: number;
    readonly unitPriceVnd: number;
  }[],
): number {
  return lines.reduce((total, line) => {
    const next = total + lineSubtotal(line.quantity, line.unitPriceVnd);
    if (!Number.isSafeInteger(next))
      throw new CartDomainError(
        "CART_TOTAL_OVERFLOW",
        "Cart total exceeds safe integer range",
      );
    return next;
  }, 0);
}
export type CartLineChange = "unchanged" | "price_changed" | "unavailable";
export function cartLineChange(input: {
  readonly previousPriceVnd: number;
  readonly currentPriceVnd: number;
  readonly quantity: number;
  readonly available: number;
  readonly purchasable: boolean;
}): CartLineChange {
  if (!input.purchasable || input.available < input.quantity)
    return "unavailable";
  return input.previousPriceVnd === input.currentPriceVnd
    ? "unchanged"
    : "price_changed";
}
export function transitionCart(
  cart: Cart,
  status: "superseded" | "checkout_ready",
  updatedAt: string,
): Cart {
  if (cart.status !== "active")
    throw new CartDomainError(
      "CART_ALREADY_FINALIZED",
      "Only an active cart can transition",
    );
  return { ...cart, status, version: cart.version + 1, updatedAt };
}
