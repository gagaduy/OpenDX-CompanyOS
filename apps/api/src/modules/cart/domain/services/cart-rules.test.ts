// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Cart } from "../entities/cart";
import type { CartItem } from "../entities/cart-item";
import { assertCartOwner, cartLineChange, cartTotal, lineSubtotal, transitionCart, validateCartItem } from "./cart-rules";
const NOW = "2026-08-05T00:00:00.000Z";
const cart = (overrides: Partial<Cart> = {}): Cart => ({ id: "c", guestSessionId: "g", status: "active", version: 1, expiresAt: "2026-08-12T00:00:00.000Z", createdAt: NOW, updatedAt: NOW, ...overrides });
const item = (overrides: Partial<CartItem> = {}): CartItem => ({ id: "i", cartId: "c", variantId: "v", quantity: 2, lastValidatedUnitPriceVnd: 1000, createdAt: NOW, updatedAt: NOW, ...overrides });
describe("cart rules", () => {
  it("requires exactly one owner", () => { assertCartOwner(cart()); expect(() => assertCartOwner(cart({ customerId: "u" }))).toThrowError(expect.objectContaining({ code: "INVALID_CART_OWNER" })); });
  it("requires safe quantities and prices", () => { expect(validateCartItem(item())).toEqual(item()); expect(() => validateCartItem(item({ quantity: 0 }))).toThrowError(expect.objectContaining({ code: "INVALID_CART_QUANTITY" })); });
  it("calculates safe VND totals", () => { expect(lineSubtotal(2, 1500)).toBe(3000); expect(cartTotal([{ quantity: 2, unitPriceVnd: 1500 }, { quantity: 1, unitPriceVnd: 500 }])).toBe(3500); expect(() => lineSubtotal(Number.MAX_SAFE_INTEGER, 2)).toThrowError(expect.objectContaining({ code: "CART_TOTAL_OVERFLOW" })); });
  it("marks price and availability changes without removing the line", () => { expect(cartLineChange({ previousPriceVnd: 1000, currentPriceVnd: 1200, quantity: 1, available: 3, purchasable: true })).toBe("price_changed"); expect(cartLineChange({ previousPriceVnd: 1000, currentPriceVnd: 1000, quantity: 2, available: 1, purchasable: true })).toBe("unavailable"); });
  it("makes terminal cart transitions one-way", () => { expect(transitionCart(cart(), "checkout_ready", NOW)).toMatchObject({ status: "checkout_ready", version: 2 }); expect(() => transitionCart(cart({ status: "superseded" }), "checkout_ready", NOW)).toThrowError(expect.objectContaining({ code: "CART_ALREADY_FINALIZED" })); });
});
