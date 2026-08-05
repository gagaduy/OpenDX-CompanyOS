// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CartDto, CartOwner } from "../../dtos/cart.dto";

export interface CartServiceContract {
  get(owner?: CartOwner): Promise<CartDto>;
  addItem(
    owner: CartOwner,
    variantId: string,
    quantity: number,
  ): Promise<CartDto>;
  updateItem(
    owner: CartOwner,
    itemId: string,
    quantity: number,
  ): Promise<CartDto>;
  removeItem(owner: CartOwner, itemId: string): Promise<CartDto>;
}
