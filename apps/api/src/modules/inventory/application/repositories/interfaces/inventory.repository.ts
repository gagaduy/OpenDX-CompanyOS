// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { InventoryItem } from "../../../domain/entities/inventory-item";
import type { StockMovement } from "../../../domain/entities/stock-movement";
import type {
  InventoryAvailability,
  InventoryItemResponseDto,
  InventoryListQuery,
} from "../../dtos/inventory.dto";

export interface InventoryListResult {
  readonly items: readonly InventoryItemResponseDto[];
  readonly totalItems: number;
}

export interface MovementListResult {
  readonly items: readonly StockMovement[];
  readonly totalItems: number;
}

export interface InventoryRepository {
  list(
    session: DatabaseSession,
    query: InventoryListQuery,
  ): Promise<InventoryListResult>;
  findById(
    session: DatabaseSession,
    id: string,
  ): Promise<InventoryItem | undefined>;
  lockById(
    session: DatabaseSession,
    id: string,
  ): Promise<InventoryItem | undefined>;
  lockByVariantId(
    session: DatabaseSession,
    variantId: string,
  ): Promise<InventoryItem | undefined>;
  create(session: DatabaseSession, item: InventoryItem): Promise<void>;
  updateBalance(
    session: DatabaseSession,
    item: InventoryItem,
    expectedVersion: number,
  ): Promise<boolean>;
  appendMovement(
    session: DatabaseSession,
    movement: StockMovement,
  ): Promise<void>;
  findMovementByIdempotencyKey(
    session: DatabaseSession,
    key: string,
  ): Promise<StockMovement | undefined>;
  listMovements(
    session: DatabaseSession,
    itemId: string,
    page: number,
    pageSize: number,
  ): Promise<MovementListResult>;
  getAvailabilityByVariantIds(
    session: DatabaseSession,
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, InventoryAvailability>>;
}
