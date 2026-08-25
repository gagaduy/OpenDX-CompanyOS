// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StockMovement } from "../../domain/entities/stock-movement";

export type InventoryStaffRole =
  | "administrator"
  | "catalog_manager"
  | "inventory_manager";
export type InventoryStockStatus = "healthy" | "low" | "out_of_stock";

export interface InventoryCommandContext {
  readonly actorId: string;
  readonly roles: readonly InventoryStaffRole[];
  readonly correlationId: string;
}

export interface InventorySystemContext {
  readonly actorType: "staff" | "system";
  readonly actorId: string;
  readonly correlationId: string;
}

export interface InventoryListQuery {
  readonly query?: string;
  readonly categoryId?: string;
  readonly stockStatus?: InventoryStockStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface ReceiveStockRequestDto {
  readonly variantId: string;
  readonly quantity: number;
  readonly idempotencyKey: string;
}

export interface AdjustStockRequestDto {
  readonly delta: number;
  readonly reasonCode: string;
  readonly reasonNote?: string;
  readonly version: number;
}

export interface InventoryItemResponseDto {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productId?: string;
  readonly productName?: string;
  readonly variantTitle?: string;
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly primaryMediaId?: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly stockStatus: InventoryStockStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PaginatedInventoryItemsDto {
  readonly items: readonly InventoryItemResponseDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface PaginatedStockMovementsDto {
  readonly items: readonly StockMovement[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface InventoryAvailability {
  readonly initialized: boolean;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
}
