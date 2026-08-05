// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontVariantReader } from "../../../../catalog";
import type { InventoryAvailabilityReader } from "../../../../inventory";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { Cart } from "../../../domain/entities/cart";
import type { CartItem } from "../../../domain/entities/cart-item";
import { validateCartItem } from "../../../domain/services/cart-rules";
import type { CartDto, CartOwner } from "../../dtos/cart.dto";
import { emptyCart, mapCart } from "../../mappers/cart.mapper";
import type { CartRepository } from "../../repositories/interfaces/cart.repository";
import { CartApplicationError } from "../cart-application.error";
import type { CartServiceContract } from "../interfaces/cart.service";

export class CartService implements CartServiceContract {
  constructor(
    private readonly repository: CartRepository,
    private readonly variants: StorefrontVariantReader,
    private readonly inventory: InventoryAvailabilityReader,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async get(owner?: CartOwner): Promise<CartDto> {
    if (owner === undefined) return emptyCart();
    const snapshot = await this.transactions.runReadOnly(async (session) => {
      const cart = await this.repository.findActiveByOwner(session, owner);
      return cart === undefined
        ? undefined
        : { cart, items: await this.repository.listItems(session, cart.id) };
    });
    return snapshot === undefined ? emptyCart(owner) : this.project(owner, snapshot.cart, snapshot.items);
  }

  async addItem(owner: CartOwner, variantId: string, quantity: number): Promise<CartDto> {
    assertQuantity(quantity);
    const projection = await this.requirePurchasableVariant(variantId);
    await this.mutateWithCreateRetry(owner, async (session, cart, items, timestamp) => {
      const existing = items.find((item) => item.variantId === variantId);
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      await this.assertAvailable(variantId, nextQuantity);
      if (existing === undefined) {
        await this.repository.createItem(session, validateCartItem({
          id: this.generateId(),
          cartId: cart.id,
          variantId,
          quantity: nextQuantity,
          lastValidatedUnitPriceVnd: projection.unitPriceVnd,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
      } else {
        await this.repository.updateItem(session, validateCartItem({
          ...existing,
          quantity: nextQuantity,
          lastValidatedUnitPriceVnd: projection.unitPriceVnd,
          updatedAt: timestamp,
        }));
      }
    });
    return this.get(owner);
  }

  async updateItem(owner: CartOwner, itemId: string, quantity: number): Promise<CartDto> {
    assertQuantity(quantity);
    await this.mutate(owner, false, async (session, cart, items, timestamp) => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (item === undefined) throw new CartApplicationError("CART_NOT_FOUND", "Cart item not found");
      const projection = await this.requirePurchasableVariant(item.variantId);
      await this.assertAvailable(item.variantId, quantity);
      await this.repository.updateItem(session, validateCartItem({
        ...item,
        quantity,
        lastValidatedUnitPriceVnd: projection.unitPriceVnd,
        updatedAt: timestamp,
      }));
    });
    return this.get(owner);
  }

  async removeItem(owner: CartOwner, itemId: string): Promise<CartDto> {
    await this.mutate(owner, false, async (session, cart) => {
      if (!(await this.repository.deleteItem(session, cart.id, itemId))) {
        throw new CartApplicationError("CART_NOT_FOUND", "Cart item not found");
      }
    });
    return this.get(owner);
  }

  private async mutateWithCreateRetry(
    owner: CartOwner,
    operation: (
      session: DatabaseSession,
      cart: Cart,
      items: readonly CartItem[],
      timestamp: string,
    ) => Promise<void>,
  ): Promise<void> {
    try {
      await this.mutate(owner, true, operation);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.mutate(owner, false, operation);
    }
  }

  private async mutate(
    owner: CartOwner,
    create: boolean,
    operation: (
      session: DatabaseSession,
      cart: Cart,
      items: readonly CartItem[],
      timestamp: string,
    ) => Promise<void>,
  ): Promise<void> {
    await this.transactions.run(async (session) => {
      const timestamp = this.now();
      let cart = await this.repository.lockActiveByOwner(session, owner);
      if (cart === undefined && create) {
        cart = {
          id: this.generateId(),
          ...(owner.kind === "guest" ? { guestSessionId: owner.guestSessionId } : { customerId: owner.customerId }),
          status: "active",
          version: 1,
          expiresAt: owner.expiresAt,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await this.repository.create(session, cart);
      }
      if (cart === undefined) throw new CartApplicationError("CART_NOT_FOUND", "Active cart not found");
      const items = await this.repository.listItems(session, cart.id);
      await operation(session, cart, items, timestamp);
      const updated = { ...cart, version: cart.version + 1, updatedAt: timestamp };
      if (!(await this.repository.updateCartVersion(session, updated, cart.version))) {
        throw new CartApplicationError("CART_CONFLICT", "Cart version is stale");
      }
    });
  }

  private async project(owner: CartOwner, cart: Cart, items: readonly CartItem[]): Promise<CartDto> {
    const ids = items.map((item) => item.variantId);
    const [variants, availability] = await Promise.all([
      this.variants.getByIds(ids),
      this.inventory.getByVariantIds(ids),
    ]);
    return mapCart(cart, owner, items, variants, availability);
  }

  private async requirePurchasableVariant(variantId: string) {
    const variant = (await this.variants.getByIds([variantId])).get(variantId);
    if (variant === undefined || variant.unitPriceVnd <= 0) {
      throw new CartApplicationError("PRODUCT_NOT_AVAILABLE", "Product variant is not available");
    }
    return variant;
  }

  private async assertAvailable(variantId: string, quantity: number): Promise<void> {
    const stock = (await this.inventory.getByVariantIds([variantId])).get(variantId);
    if (stock?.initialized !== true || stock.available < quantity) {
      throw new CartApplicationError("INSUFFICIENT_STOCK", "Requested quantity is not available");
    }
  }
}

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 999) {
    throw new CartApplicationError("INVALID_CART_QUANTITY", "Quantity must be between 1 and 999");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
