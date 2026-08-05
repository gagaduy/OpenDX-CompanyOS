// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CartRepository } from "../../../application/repositories/interfaces/cart.repository";
import type { CartOwner } from "../../../application/dtos/cart.dto";
import type { Cart } from "../../../domain/entities/cart";
import type { CartItem } from "../../../domain/entities/cart-item";

type Row = Record<string, unknown>;
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);

function mapCart(row: Row): Cart {
  return {
    id: String(row.id),
    ...(row.guest_session_id === null ? {} : { guestSessionId: String(row.guest_session_id) }),
    ...(row.customer_id === null ? {} : { customerId: String(row.customer_id) }),
    status: String(row.status) as Cart["status"],
    version: Number(row.version),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapItem(row: Row): CartItem {
  return {
    id: String(row.id),
    cartId: String(row.cart_id),
    variantId: String(row.variant_id),
    quantity: Number(row.quantity),
    lastValidatedUnitPriceVnd: Number(row.last_validated_unit_price_vnd),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function ownerPredicate(owner: CartOwner): { sql: string; value: string } {
  return owner.kind === "guest"
    ? { sql: "guest_session_id = $1", value: owner.guestSessionId }
    : { sql: "customer_id = $1", value: owner.customerId };
}

export class PostgresqlCartRepository implements CartRepository {
  async findActiveByOwner(session: DatabaseSession, owner: CartOwner): Promise<Cart | undefined> {
    return this.findActive(session, owner, false);
  }

  async lockActiveByOwner(session: DatabaseSession, owner: CartOwner): Promise<Cart | undefined> {
    return this.findActive(session, owner, true);
  }

  async create(session: DatabaseSession, cart: Cart): Promise<void> {
    await session.query(
      `INSERT INTO carts(
         id, guest_session_id, customer_id, status, version, expires_at, created_at, updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        cart.id,
        cart.guestSessionId ?? null,
        cart.customerId ?? null,
        cart.status,
        cart.version,
        cart.expiresAt,
        cart.createdAt,
        cart.updatedAt,
      ],
    );
  }

  async listItems(session: DatabaseSession, cartId: string): Promise<readonly CartItem[]> {
    const result = await session.query<Row>(
      "SELECT * FROM cart_items WHERE cart_id = $1 ORDER BY created_at, id",
      [cartId],
    );
    return result.rows.map(mapItem);
  }

  async findItem(session: DatabaseSession, cartId: string, itemId: string): Promise<CartItem | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM cart_items WHERE cart_id = $1 AND id = $2",
      [cartId, itemId],
    );
    return result.rows[0] === undefined ? undefined : mapItem(result.rows[0]);
  }

  async findItemByVariant(session: DatabaseSession, cartId: string, variantId: string): Promise<CartItem | undefined> {
    const result = await session.query<Row>(
      "SELECT * FROM cart_items WHERE cart_id = $1 AND variant_id = $2",
      [cartId, variantId],
    );
    return result.rows[0] === undefined ? undefined : mapItem(result.rows[0]);
  }

  async createItem(session: DatabaseSession, item: CartItem): Promise<void> {
    await session.query(
      `INSERT INTO cart_items(
         id, cart_id, variant_id, quantity, last_validated_unit_price_vnd, created_at, updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [item.id, item.cartId, item.variantId, item.quantity, item.lastValidatedUnitPriceVnd, item.createdAt, item.updatedAt],
    );
  }

  async updateItem(session: DatabaseSession, item: CartItem): Promise<void> {
    await session.query(
      `UPDATE cart_items
       SET quantity = $3, last_validated_unit_price_vnd = $4, updated_at = $5
       WHERE cart_id = $1 AND id = $2`,
      [item.cartId, item.id, item.quantity, item.lastValidatedUnitPriceVnd, item.updatedAt],
    );
  }

  async deleteItem(session: DatabaseSession, cartId: string, itemId: string): Promise<boolean> {
    const result = await session.query(
      "DELETE FROM cart_items WHERE cart_id = $1 AND id = $2",
      [cartId, itemId],
    );
    return result.rowCount === 1;
  }

  async updateCartVersion(session: DatabaseSession, cart: Cart, expectedVersion: number): Promise<boolean> {
    const result = await session.query(
      `UPDATE carts SET version = $2, status = $3, expires_at = $4, updated_at = $5
       WHERE id = $1 AND version = $6`,
      [cart.id, cart.version, cart.status, cart.expiresAt, cart.updatedAt, expectedVersion],
    );
    return result.rowCount === 1;
  }

  private async findActive(
    session: DatabaseSession,
    owner: CartOwner,
    lock: boolean,
  ): Promise<Cart | undefined> {
    const predicate = ownerPredicate(owner);
    const result = await session.query<Row>(
      `SELECT * FROM carts
       WHERE ${predicate.sql} AND status = 'active' AND expires_at > NOW()
       ${lock ? "FOR UPDATE" : ""}`,
      [predicate.value],
    );
    return result.rows[0] === undefined ? undefined : mapCart(result.rows[0]);
  }
}
