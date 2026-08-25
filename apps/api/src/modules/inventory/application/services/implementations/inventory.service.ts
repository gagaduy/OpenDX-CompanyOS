// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CatalogVariantReader, CatalogVariantSummary } from "../../../../catalog";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { InventoryItem } from "../../../domain/entities/inventory-item";
import type { StockMovement } from "../../../domain/entities/stock-movement";
import { applyAdjustment, applyReceipt, availableQuantity } from "../../../domain/services/inventory-rules";
import type {
  AdjustStockRequestDto,
  InventoryAvailability,
  InventoryCommandContext,
  InventoryItemResponseDto,
  InventoryListQuery,
  InventoryStockStatus,
  PaginatedInventoryItemsDto,
  PaginatedStockMovementsDto,
  ReceiveStockRequestDto,
} from "../../dtos/inventory.dto";
import type { InventoryAuditRepository } from "../../repositories/interfaces/inventory-audit.repository";
import type { InventoryRepository } from "../../repositories/interfaces/inventory.repository";
import { InventoryApplicationError } from "../inventory-application.error";
import type { InventoryAvailabilityReader } from "../interfaces/inventory-availability";
import type { InventoryServiceContract } from "../interfaces/inventory.service";

const writeRoles = new Set(["administrator", "inventory_manager"]);

export class InventoryService
  implements InventoryServiceContract, InventoryAvailabilityReader
{
  constructor(
    private readonly repository: InventoryRepository,
    private readonly variants: CatalogVariantReader,
    private readonly audit: InventoryAuditRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async list(query: InventoryListQuery): Promise<PaginatedInventoryItemsDto> {
    return this.transactions.runReadOnly(async (session) => {
      const result = await this.repository.list(session, query);
      return {
        items: result.items,
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      };
    });
  }

  async get(id: string): Promise<InventoryItemResponseDto> {
    return this.transactions.runReadOnly(async (session) => {
      const item = await this.requireItem(session, id);
      const variant = await this.requireVariant(session, item.variantId);
      return mapItem(item, variant.sku);
    });
  }

  async receive(
    request: ReceiveStockRequestDto,
    context: InventoryCommandContext,
  ): Promise<InventoryItemResponseDto> {
    requireWriteRole(context);
    try {
      return await this.transactions.run(async (session) => {
        const prior = await this.repository.findMovementByIdempotencyKey(
          session,
          request.idempotencyKey,
        );
        if (prior !== undefined) return this.mapReceiptRetry(session, prior, request);

        const variant = await this.requireActiveVariant(session, request.variantId);
        const timestamp = this.now();
        const current = await this.repository.lockByVariantId(session, request.variantId);
        let updated: InventoryItem;
        if (current === undefined) {
          updated = {
            id: this.generateId(),
            variantId: request.variantId,
            onHand: request.quantity,
            reserved: 0,
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          availableQuantity(updated);
          await this.repository.create(session, updated);
        } else {
          updated = applyReceipt(current, request.quantity, timestamp);
          if (!(await this.repository.updateBalance(session, updated, current.version))) {
            throw new InventoryApplicationError(
              "STALE_VERSION",
              "Inventory version is stale",
            );
          }
        }
        await this.repository.appendMovement(
          session,
          this.movement(updated.id, "receive", request.quantity, 0, {
            reasonCode: "STOCK_RECEIPT",
            idempotencyKey: request.idempotencyKey,
            context,
            occurredAt: timestamp,
          }),
        );
        await this.appendAudit(
          session,
          updated,
          "inventory.stock.received",
          context,
          { quantity: request.quantity, version: updated.version },
        );
        return mapItem(updated, variant.sku);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.transactions.runReadOnly(async (session) => {
        const prior = await this.repository.findMovementByIdempotencyKey(
          session,
          request.idempotencyKey,
        );
        if (prior === undefined) throw error;
        return this.mapReceiptRetry(session, prior, request);
      });
    }
  }

  async adjust(
    id: string,
    request: AdjustStockRequestDto,
    context: InventoryCommandContext,
  ): Promise<InventoryItemResponseDto> {
    requireWriteRole(context);
    return this.transactions.run(async (session) => {
      const current = await this.repository.lockById(session, id);
      if (current === undefined) {
        throw new InventoryApplicationError(
          "INVENTORY_ITEM_NOT_FOUND",
          "Inventory item not found",
        );
      }
      if (current.version !== request.version) {
        throw new InventoryApplicationError(
          "STALE_VERSION",
          "Inventory version is stale",
        );
      }
      const variant = await this.requireVariant(session, current.variantId);
      const timestamp = this.now();
      const updated = applyAdjustment(current, request.delta, timestamp);
      if (!(await this.repository.updateBalance(session, updated, request.version))) {
        throw new InventoryApplicationError(
          "STALE_VERSION",
          "Inventory version is stale",
        );
      }
      await this.repository.appendMovement(
        session,
        this.movement(updated.id, "adjustment", request.delta, 0, {
          reasonCode: request.reasonCode.trim(),
          ...(request.reasonNote === undefined
            ? {}
            : { reasonNote: request.reasonNote.trim() }),
          context,
          occurredAt: timestamp,
        }),
      );
      await this.appendAudit(
        session,
        updated,
        "inventory.stock.adjusted",
        context,
        { delta: request.delta, reasonCode: request.reasonCode, version: updated.version },
      );
      return mapItem(updated, variant.sku);
    });
  }

  async listMovements(
    id: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedStockMovementsDto> {
    return this.transactions.runReadOnly(async (session) => {
      await this.requireItem(session, id);
      const result = await this.repository.listMovements(session, id, page, pageSize);
      return {
        items: result.items,
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      };
    });
  }

  async getByVariantIds(
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, InventoryAvailability>> {
    if (variantIds.length === 0) return new Map();
    return this.transactions.runReadOnly((session) =>
      this.repository.getAvailabilityByVariantIds(session, variantIds),
    );
  }

  private async requireItem(
    session: DatabaseSession,
    id: string,
  ): Promise<InventoryItem> {
    const item = await this.repository.findById(session, id);
    if (item === undefined) {
      throw new InventoryApplicationError(
        "INVENTORY_ITEM_NOT_FOUND",
        "Inventory item not found",
      );
    }
    return item;
  }

  private async mapReceiptRetry(
    session: DatabaseSession,
    prior: StockMovement,
    request: ReceiveStockRequestDto,
  ): Promise<InventoryItemResponseDto> {
    if (
      prior.movementType !== "receive" ||
      prior.onHandDelta !== request.quantity
    ) {
      throw new InventoryApplicationError(
        "CONFLICT",
        "Idempotency key belongs to another stock operation",
      );
    }
    const current = await this.requireItem(session, prior.inventoryItemId);
    if (current.variantId !== request.variantId) {
      throw new InventoryApplicationError(
        "CONFLICT",
        "Idempotency key belongs to another stock operation",
      );
    }
    const variant = await this.requireVariant(session, current.variantId);
    return mapItem(current, variant.sku);
  }

  private async requireVariant(
    session: DatabaseSession,
    id: string,
  ): Promise<CatalogVariantSummary> {
    const variant = await this.variants.findById(session, id);
    if (variant === undefined) {
      throw new InventoryApplicationError("VARIANT_NOT_FOUND", "Variant not found");
    }
    return variant;
  }

  private async requireActiveVariant(
    session: DatabaseSession,
    id: string,
  ): Promise<CatalogVariantSummary> {
    const variant = await this.requireVariant(session, id);
    if (variant.status !== "active") {
      throw new InventoryApplicationError(
        "VARIANT_NOT_ACTIVE",
        "Archived variant cannot receive stock",
      );
    }
    return variant;
  }

  private movement(
    inventoryItemId: string,
    movementType: StockMovement["movementType"],
    onHandDelta: number,
    reservedDelta: number,
    details: {
      readonly reasonCode: string;
      readonly reasonNote?: string;
      readonly idempotencyKey?: string;
      readonly context: InventoryCommandContext;
      readonly occurredAt: string;
    },
  ): StockMovement {
    return {
      id: this.generateId(),
      inventoryItemId,
      movementType,
      onHandDelta,
      reservedDelta,
      reasonCode: details.reasonCode,
      ...(details.reasonNote === undefined ? {} : { reasonNote: details.reasonNote }),
      actorType: "staff",
      actorId: details.context.actorId,
      correlationId: details.context.correlationId,
      ...(details.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: details.idempotencyKey }),
      occurredAt: details.occurredAt,
    };
  }

  private async appendAudit(
    session: DatabaseSession,
    item: InventoryItem,
    action: string,
    context: InventoryCommandContext,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.audit.append(session, {
      id: this.generateId(),
      actorType: "staff",
      actorId: context.actorId,
      action,
      resourceType: "inventory_item",
      resourceId: item.id,
      outcome: "success",
      correlationId: context.correlationId,
      metadata,
      occurredAt: this.now(),
    });
  }
}

function requireWriteRole(context: InventoryCommandContext): void {
  if (!context.roles.some((role) => writeRoles.has(role))) {
    throw new InventoryApplicationError("FORBIDDEN", "Insufficient permissions");
  }
}

function mapItem(item: InventoryItem, sku: string): InventoryItemResponseDto {
  const available = availableQuantity(item);
  return {
    ...item,
    sku,
    available,
    stockStatus: stockStatus(available),
  };
}

function stockStatus(available: number): InventoryStockStatus {
  if (available === 0) return "out_of_stock";
  if (available <= 5) return "low";
  return "healthy";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
