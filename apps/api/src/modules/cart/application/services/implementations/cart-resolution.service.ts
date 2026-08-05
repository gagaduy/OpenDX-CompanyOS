// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StorefrontVariantReader } from "../../../../catalog";
import type { InventoryAvailabilityReader } from "../../../../inventory";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Cart } from "../../../domain/entities/cart";
import type { CartItem } from "../../../domain/entities/cart-item";
import type { CartOwner } from "../../dtos/cart.dto";
import type { CartRepository } from "../../repositories/interfaces/cart.repository";
import { CartApplicationError } from "../cart-application.error";
import type {
  CartResolutionAction,
  CartResolutionServiceContract,
  CartResolutionState,
} from "../interfaces/cart-resolution.service";
import type { CartServiceContract } from "../interfaces/cart.service";

export class CartResolutionService implements CartResolutionServiceContract {
  constructor(
    private readonly repository: CartRepository,
    private readonly carts: CartServiceContract,
    private readonly variants: StorefrontVariantReader,
    private readonly inventory: InventoryAvailabilityReader,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async inspect(
    customerId: string,
    customerExpiresAt: string,
    guestSessionId?: string,
    guestExpiresAt?: string,
    autoResolve = false,
  ): Promise<CartResolutionState> {
    const customer: CartOwner = { kind: "customer", customerId, expiresAt: customerExpiresAt };
    if (guestSessionId === undefined || guestExpiresAt === undefined) {
      return { status: "not_required", resultingCart: await this.carts.get(customer) };
    }
    const guest: CartOwner = { kind: "guest", guestSessionId, expiresAt: guestExpiresAt };
    const [guestCart, savedCart] = await Promise.all([this.carts.get(guest), this.carts.get(customer)]);
    if (guestCart.items.length > 0 && savedCart.items.length > 0) {
      return { status: "required", guestCart, savedCart };
    }
    if (!autoResolve || guestCart.id === undefined) {
      return { status: "not_required", guestCart, savedCart, resultingCart: savedCart };
    }

    await this.transactions.run(async (session) => {
      const lockedGuest = await this.repository.lockActiveByOwner(session, guest);
      const lockedSaved = await this.repository.lockActiveByOwner(session, customer);
      if (lockedGuest === undefined) return;
      const guestItems = await this.repository.listItems(session, lockedGuest.id);
      const savedItems = lockedSaved === undefined ? [] : await this.repository.listItems(session, lockedSaved.id);
      if (guestItems.length > 0 && savedItems.length === 0) {
        if (lockedSaved !== undefined) await this.requireSupersede(session, lockedSaved, customer);
        await this.requireTransfer(session, lockedGuest, guest, customer);
      } else if (guestItems.length === 0 && savedItems.length > 0) {
        await this.requireSupersede(session, lockedGuest, guest);
      }
    });
    return { status: "resolved", resultingCart: await this.carts.get(customer) };
  }

  async resolve(input: {
    readonly customerId: string;
    readonly customerExpiresAt: string;
    readonly guestSessionId: string;
    readonly guestExpiresAt: string;
    readonly action: CartResolutionAction;
    readonly idempotencyKey: string;
  }): Promise<CartResolutionState> {
    const customer: CartOwner = { kind: "customer", customerId: input.customerId, expiresAt: input.customerExpiresAt };
    const guest: CartOwner = { kind: "guest", guestSessionId: input.guestSessionId, expiresAt: input.guestExpiresAt };
    const fingerprint = requestFingerprint(input.action, input.guestSessionId);
    await this.transactions.run(async (session) => {
      const prior = await this.repository.findResolutionRequest(session, input.customerId, input.idempotencyKey);
      if (prior !== undefined) {
        if (prior.requestFingerprint !== fingerprint) {
          throw new CartApplicationError("CART_RESOLUTION_CONFLICT", "Idempotency key belongs to another resolution request");
        }
        return;
      }
      const guestCart = await this.repository.lockActiveByOwner(session, guest);
      const savedCart = await this.repository.lockActiveByOwner(session, customer);
      if (guestCart === undefined || savedCart === undefined) {
        throw new CartApplicationError("CART_RESOLUTION_CONFLICT", "Both active carts are required");
      }
      const guestItems = await this.repository.listItems(session, guestCart.id);
      const savedItems = await this.repository.listItems(session, savedCart.id);
      if (guestItems.length === 0 || savedItems.length === 0) {
        throw new CartApplicationError("CART_RESOLUTION_CONFLICT", "Cart resolution is no longer required");
      }
      let resultingCartId: string;
      if (input.action === "keep_guest") {
        await this.requireSupersede(session, savedCart, customer);
        await this.requireTransfer(session, guestCart, guest, customer);
        resultingCartId = guestCart.id;
      } else if (input.action === "keep_saved") {
        await this.requireSupersede(session, guestCart, guest);
        resultingCartId = savedCart.id;
      } else {
        await this.merge(session, guestCart, savedCart, guestItems, savedItems);
        await this.requireSupersede(session, guestCart, guest);
        resultingCartId = savedCart.id;
      }
      await this.repository.createResolutionRequest(session, {
        id: this.generateId(),
        customerId: input.customerId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint,
        action: input.action,
        guestCartId: guestCart.id,
        savedCartId: savedCart.id,
        resultingCartId,
        createdAt: this.now(),
      });
    });
    return { status: "resolved", resultingCart: await this.carts.get(customer) };
  }

  private async merge(
    session: DatabaseSession,
    guestCart: Cart,
    savedCart: Cart,
    guestItems: readonly CartItem[],
    savedItems: readonly CartItem[],
  ): Promise<void> {
    const quantities = new Map<string, number>();
    for (const item of [...savedItems, ...guestItems]) {
      quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
    }
    const ids = [...quantities.keys()];
    const [variants, availability] = await Promise.all([
      this.variants.getByIds(ids),
      this.inventory.getByVariantIds(ids),
    ]);
    for (const [variantId, quantity] of quantities) {
      const variant = variants.get(variantId);
      const stock = availability.get(variantId);
      if (variant === undefined || stock?.initialized !== true || stock.available < quantity) {
        throw new CartApplicationError("CART_RESOLUTION_CONFLICT", "Merged cart has unavailable quantities");
      }
      const existing = savedItems.find((item) => item.variantId === variantId);
      const timestamp = this.now();
      if (existing === undefined) {
        await this.repository.createItem(session, {
          id: this.generateId(), cartId: savedCart.id, variantId, quantity,
          lastValidatedUnitPriceVnd: variant.unitPriceVnd,
          createdAt: timestamp, updatedAt: timestamp,
        });
      } else {
        await this.repository.updateItem(session, {
          ...existing, quantity, lastValidatedUnitPriceVnd: variant.unitPriceVnd, updatedAt: timestamp,
        });
      }
    }
    await this.repository.updateCartVersion(
      session,
      { ...savedCart, version: savedCart.version + 1, updatedAt: this.now() },
      savedCart.version,
    );
  }

  private async requireSupersede(session: DatabaseSession, cart: Cart, owner: CartOwner): Promise<void> {
    if (!(await this.repository.supersede(session, cart.id, owner, this.now()))) {
      throw new CartApplicationError("CART_OWNERSHIP_DENIED", "Cart ownership changed");
    }
  }

  private async requireTransfer(
    session: DatabaseSession,
    cart: Cart,
    guest: Extract<CartOwner, { kind: "guest" }>,
    customer: Extract<CartOwner, { kind: "customer" }>,
  ): Promise<void> {
    if (!(await this.repository.transferGuestCart(
      session,
      cart.id,
      guest.guestSessionId,
      customer.customerId,
      customer.expiresAt,
      this.now(),
    ))) {
      throw new CartApplicationError("CART_OWNERSHIP_DENIED", "Cart ownership changed");
    }
  }
}

function requestFingerprint(action: CartResolutionAction, guestSessionId: string): string {
  return createHash("sha256").update(JSON.stringify({ action, guestSessionId })).digest("hex");
}
