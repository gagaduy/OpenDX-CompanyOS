// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { inventoryItemSchema, movementSchema } from "../schemas/inventory-api.schema";
import type { InventoryItemView, InventoryMovementView } from "../types/inventory.types";

export function mapInventoryItem(value: z.infer<typeof inventoryItemSchema>, apiBaseUrl: string): InventoryItemView {
  return {
    id: value.id,
    variantId: value.variantId,
    productName: value.productName ?? "Unknown product",
    variantTitle: value.variantTitle ?? value.sku,
    sku: value.sku,
    ...(value.categoryId === undefined ? {} : { categoryId: value.categoryId }),
    ...(value.categoryName === undefined ? {} : { categoryName: value.categoryName }),
    ...(value.productId === undefined || value.primaryMediaId === undefined ? {} : {
      primaryMediaUrl: `${apiBaseUrl}/v1/admin/catalog/products/${value.productId}/media/${value.primaryMediaId}/content`,
    }),
    onHand: value.onHand,
    reserved: value.reserved,
    available: value.available,
    stockStatus: value.stockStatus,
    version: value.version,
  };
}

export function mapMovement(value: z.infer<typeof movementSchema>): InventoryMovementView {
  return {
    id: value.id, movementType: value.movementType, onHandDelta: value.onHandDelta,
    reservedDelta: value.reservedDelta, reasonCode: value.reasonCode,
    ...(value.reasonNote === undefined ? {} : { reasonNote: value.reasonNote }),
    actorType: value.actorType, actorId: value.actorId, occurredAt: value.occurredAt,
  };
}
