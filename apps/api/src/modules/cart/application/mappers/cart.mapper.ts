// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontVariantSummary } from "../../../catalog";
import type { InventoryAvailability } from "../../../inventory/application/dtos/inventory.dto";
import type { Cart } from "../../domain/entities/cart";
import type { CartItem } from "../../domain/entities/cart-item";
import {
  cartLineChange,
  cartTotal,
  lineSubtotal,
} from "../../domain/services/cart-rules";
import type { CartDto, CartLineDto, CartOwner } from "../dtos/cart.dto";

export function emptyCart(owner?: CartOwner): CartDto {
  return {
    ownerKind: owner?.kind ?? "anonymous",
    version: 0,
    status: "empty",
    items: [],
    itemCount: 0,
    totalVnd: 0,
    requiresAction: false,
  };
}

export function mapCart(
  cart: Cart,
  owner: CartOwner,
  items: readonly CartItem[],
  variants: ReadonlyMap<string, StorefrontVariantSummary>,
  availability: ReadonlyMap<string, InventoryAvailability>,
): CartDto {
  const lines = items.map((item) =>
    mapLine(
      item,
      variants.get(item.variantId),
      availability.get(item.variantId),
    ),
  );
  return {
    id: cart.id,
    ownerKind: owner.kind,
    version: cart.version,
    status: cart.status === "checkout_ready" ? "checkout_ready" : "active",
    items: lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    totalVnd: cartTotal(
      lines.map((line) => ({
        quantity: line.quantity,
        unitPriceVnd: line.unitPriceVnd,
      })),
    ),
    requiresAction: lines.some((line) => line.change !== "unchanged"),
  };
}

function mapLine(
  item: CartItem,
  variant: StorefrontVariantSummary | undefined,
  stock: InventoryAvailability | undefined,
): CartLineDto {
  const currentPrice = variant?.unitPriceVnd ?? item.lastValidatedUnitPriceVnd;
  const available = stock?.initialized === true ? stock.available : 0;
  const purchasable =
    variant !== undefined && stock?.initialized === true && available > 0;
  return {
    id: item.id,
    variantId: item.variantId,
    ...(variant === undefined
      ? {}
      : {
          productId: variant.productId,
          productSlug: variant.productSlug,
          sku: variant.sku,
          primaryMediaUrl: `/v1/storefront/products/${variant.productId}/media/${variant.primaryMediaId}/content`,
        }),
    productName: variant?.productName ?? "Unavailable product",
    variantTitle: variant?.variantTitle ?? "Unavailable variant",
    optionValues: variant?.optionValues ?? {},
    primaryMediaAltText: variant?.primaryMediaAltText ?? "Product unavailable",
    quantity: item.quantity,
    unitPriceVnd: currentPrice,
    subtotalVnd: lineSubtotal(item.quantity, currentPrice),
    availableQuantity: available,
    purchasable,
    change: cartLineChange({
      previousPriceVnd: item.lastValidatedUnitPriceVnd,
      currentPriceVnd: currentPrice,
      quantity: item.quantity,
      available,
      purchasable,
    }),
  };
}
