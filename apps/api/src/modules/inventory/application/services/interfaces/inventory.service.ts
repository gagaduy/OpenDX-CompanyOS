// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  AdjustStockRequestDto,
  InventoryCommandContext,
  InventoryItemResponseDto,
  InventoryListQuery,
  PaginatedInventoryItemsDto,
  PaginatedStockMovementsDto,
  ReceiveStockRequestDto,
} from "../../dtos/inventory.dto";

export interface InventoryServiceContract {
  list(query: InventoryListQuery): Promise<PaginatedInventoryItemsDto>;
  get(id: string): Promise<InventoryItemResponseDto>;
  receive(
    request: ReceiveStockRequestDto,
    context: InventoryCommandContext,
  ): Promise<InventoryItemResponseDto>;
  adjust(
    id: string,
    request: AdjustStockRequestDto,
    context: InventoryCommandContext,
  ): Promise<InventoryItemResponseDto>;
  listMovements(
    id: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedStockMovementsDto>;
}
