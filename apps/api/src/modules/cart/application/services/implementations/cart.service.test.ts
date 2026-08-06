// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type {
  StorefrontVariantReader,
  StorefrontVariantSummary,
} from "../../../../catalog";
import type { InventoryAvailabilityReader } from "../../../../inventory";
import type {
  DatabaseSession,
  TransactionRunner,
} from "../../../../../shared/database/transaction";
import type { CartOwner } from "../../dtos/cart.dto";
import type { CartRepository } from "../../repositories/interfaces/cart.repository";
import type { Cart } from "../../../domain/entities/cart";
import type { CartItem } from "../../../domain/entities/cart-item";
import { CartApplicationError } from "../cart-application.error";
import { CartService } from "./cart.service";

const owner: CartOwner = {
  kind: "guest",
  guestSessionId: "guest-1",
  expiresAt: "2026-08-12T00:00:00.000Z",
};
const variant: StorefrontVariantSummary = {
  variantId: "variant-1",
  productId: "product-1",
  productName: "Laptop Pro",
  productSlug: "laptop-pro",
  variantTitle: "16 GB",
  sku: "LAPTOP-PRO-16",
  optionValues: { memory: "16 GB" },
  unitPriceVnd: 25_000_000,
  primaryMediaId: "media-1",
  primaryMediaAltText: "Laptop Pro front view",
};

describe("CartService", () => {
  it("does not create state for an empty read", async () => {
    const fixture = createFixture();
    expect(await fixture.service.get(owner)).toMatchObject({
      status: "empty",
      ownerKind: "guest",
    });
    expect(fixture.repository.cart).toBeUndefined();
  });

  it("adds, aggregates, updates, and removes an authoritative cart line", async () => {
    const fixture = createFixture();
    await fixture.service.addItem(owner, variant.variantId, 1);
    const added = await fixture.service.addItem(owner, variant.variantId, 2);
    expect(added).toMatchObject({
      itemCount: 3,
      totalVnd: 75_000_000,
      requiresAction: false,
    });
    expect(added.items[0]).toMatchObject({
      quantity: 3,
      sku: variant.sku,
      availableQuantity: 5,
      primaryMediaUrl:
        "/v1/storefront/products/product-1/media/media-1/content",
    });

    const updated = await fixture.service.updateItem(
      owner,
      added.items[0]!.id,
      2,
    );
    expect(updated.totalVnd).toBe(50_000_000);
    expect(
      (await fixture.service.removeItem(owner, updated.items[0]!.id)).items,
    ).toEqual([]);
  });

  it("keeps stale lines visible with price and availability change markers", async () => {
    const fixture = createFixture();
    await fixture.service.addItem(owner, variant.variantId, 2);
    fixture.variant.unitPriceVnd = 24_000_000;
    fixture.available = 1;

    const cart = await fixture.service.get(owner);
    expect(cart.items[0]).toMatchObject({
      unitPriceVnd: 24_000_000,
      subtotalVnd: 48_000_000,
      change: "unavailable",
    });
    expect(cart.requiresAction).toBe(true);
  });

  it("rejects unpublished variants and insufficient stock", async () => {
    const fixture = createFixture();
    fixture.published = false;
    await expect(
      fixture.service.addItem(owner, variant.variantId, 1),
    ).rejects.toMatchObject({
      code: "PRODUCT_NOT_AVAILABLE",
    } satisfies Partial<CartApplicationError>);
    fixture.published = true;
    await expect(
      fixture.service.addItem(owner, variant.variantId, 6),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    } satisfies Partial<CartApplicationError>);
  });

  it("locks a raw customer cart snapshot in the supplied checkout session", async () => {
    const fixture = createFixture();
    const customerOwner = { kind: "customer" as const, customerId: "customer-1", expiresAt: owner.expiresAt };
    await fixture.service.addItem(customerOwner, variant.variantId, 2);
    const suppliedSession: DatabaseSession = { query: vi.fn() };

    await expect(fixture.service.lockForCheckout(suppliedSession, "customer-1", owner.expiresAt)).resolves.toMatchObject({
      cartVersion: 2,
      items: [{ variantId: variant.variantId, quantity: 2, lastValidatedUnitPriceVnd: 25_000_000 }],
    });
  });
});

function createFixture() {
  const repository = new MemoryCartRepository();
  const mutableVariant = { ...variant };
  const state = { published: true, available: 5 };
  const variants: StorefrontVariantReader = {
    async getByIds(ids) {
      return state.published && ids.includes(mutableVariant.variantId)
        ? new Map([[mutableVariant.variantId, mutableVariant]])
        : new Map();
    },
  };
  const inventory: InventoryAvailabilityReader = {
    async getByVariantIds(ids) {
      return new Map(
        ids.map((id) => [
          id,
          {
            initialized: true,
            onHand: state.available,
            reserved: 0,
            available: state.available,
          },
        ]),
      );
    },
  };
  let sequence = 0;
  const transactions = {
    run: (work: (session: DatabaseSession) => Promise<unknown>) =>
      work({} as DatabaseSession),
    runReadOnly: (work: (session: DatabaseSession) => Promise<unknown>) =>
      work({} as DatabaseSession),
  } as TransactionRunner;
  const service = new CartService(
    repository,
    variants,
    inventory,
    transactions,
    () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    () => "2026-08-05T00:00:00.000Z",
  );
  return {
    service,
    repository,
    variant: mutableVariant,
    get published() {
      return state.published;
    },
    set published(value: boolean) {
      state.published = value;
    },
    get available() {
      return state.available;
    },
    set available(value: number) {
      state.available = value;
    },
  };
}

class MemoryCartRepository implements CartRepository {
  cart?: Cart;
  items: CartItem[] = [];
  async findByIdForUpdate() { return this.cart; }
  async findActiveByOwner() {
    return this.cart;
  }
  async lockActiveByOwner() {
    return this.cart;
  }
  async create(_session: DatabaseSession, cart: Cart) {
    this.cart = cart;
  }
  async listItems() {
    return [...this.items];
  }
  async findItem(_session: DatabaseSession, _cartId: string, itemId: string) {
    return this.items.find((item) => item.id === itemId);
  }
  async findItemByVariant(
    _session: DatabaseSession,
    _cartId: string,
    variantId: string,
  ) {
    return this.items.find((item) => item.variantId === variantId);
  }
  async createItem(_session: DatabaseSession, item: CartItem) {
    this.items.push(item);
  }
  async updateItem(_session: DatabaseSession, item: CartItem) {
    this.items = this.items.map((candidate) =>
      candidate.id === item.id ? item : candidate,
    );
  }
  async deleteItem(_session: DatabaseSession, _cartId: string, itemId: string) {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== itemId);
    return before !== this.items.length;
  }
  async updateCartVersion(_session: DatabaseSession, cart: Cart) {
    this.cart = cart;
    return true;
  }
  async supersede() {
    return false;
  }
  async transferGuestCart() {
    return false;
  }
  async lockResolutionKey() {}
  async findResolutionRequest() {
    return undefined;
  }
  async createResolutionRequest() {}
}
