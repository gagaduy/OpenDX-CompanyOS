// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type InventoryStockStatus = "healthy" | "low" | "out_of_stock";

export interface InventoryItemView {
  readonly id: string;
  readonly variantId: string;
  readonly productName: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly primaryMediaUrl?: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly stockStatus: InventoryStockStatus;
  readonly version: number;
}

export interface InventoryMovementView {
  readonly id: string;
  readonly movementType: "receive" | "adjustment" | "reservation" | "release" | "expiry" | "consume";
  readonly onHandDelta: number;
  readonly reservedDelta: number;
  readonly reasonCode: string;
  readonly reasonNote?: string;
  readonly actorType: "staff" | "system";
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface InventoryPageView<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface InventoryQuery {
  readonly query?: string;
  readonly categoryId?: string;
  readonly stockStatus?: InventoryStockStatus;
  readonly page: number;
  readonly pageSize: number;
}
