// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { Cart } from "../../../domain/entities/cart";
import type { CartItem } from "../../../domain/entities/cart-item";
import type { CartOwner } from "../../dtos/cart.dto";

export interface CartRepository {
  findActiveByOwner(session: DatabaseSession, owner: CartOwner): Promise<Cart | undefined>;
  lockActiveByOwner(session: DatabaseSession, owner: CartOwner): Promise<Cart | undefined>;
  create(session: DatabaseSession, cart: Cart): Promise<void>;
  listItems(session: DatabaseSession, cartId: string): Promise<readonly CartItem[]>;
  findItem(session: DatabaseSession, cartId: string, itemId: string): Promise<CartItem | undefined>;
  findItemByVariant(session: DatabaseSession, cartId: string, variantId: string): Promise<CartItem | undefined>;
  createItem(session: DatabaseSession, item: CartItem): Promise<void>;
  updateItem(session: DatabaseSession, item: CartItem): Promise<void>;
  deleteItem(session: DatabaseSession, cartId: string, itemId: string): Promise<boolean>;
  updateCartVersion(session: DatabaseSession, cart: Cart, expectedVersion: number): Promise<boolean>;
}
