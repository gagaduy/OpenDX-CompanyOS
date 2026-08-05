// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { CatalogVariantReader } from "../../../../catalog/application/services/interfaces/catalog-variant-reader";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { InventoryItem } from "../../../domain/entities/inventory-item";
import type { StockMovement } from "../../../domain/entities/stock-movement";
import type { InventoryAuditEntry, InventoryAuditRepository } from "../../repositories/interfaces/inventory-audit.repository";
import type { InventoryRepository } from "../../repositories/interfaces/inventory.repository";
import { InventoryService } from "./inventory.service";

const NOW = "2026-08-05T00:00:00.000Z";
const ITEM_ID = "71000000-0000-4000-8000-000000000001";
const VARIANT_ID = "72000000-0000-4000-8000-000000000001";
const session: DatabaseSession = { query: vi.fn() };
const context = {
  actorId: "staff-1",
  roles: ["inventory_manager"] as const,
  correlationId: "corr-1",
};

function inventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: ITEM_ID,
    variantId: VARIANT_ID,
    onHand: 5,
    reserved: 2,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "73000000-0000-4000-8000-000000000001",
    inventoryItemId: ITEM_ID,
    movementType: "receive",
    onHandDelta: 8,
    reservedDelta: 0,
    reasonCode: "STOCK_RECEIPT",
    actorType: "staff",
    actorId: context.actorId,
    correlationId: context.correlationId,
    idempotencyKey: "receipt-001",
    occurredAt: NOW,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<InventoryRepository> = {},
  transactionOverrides: Partial<TransactionRunner> = {},
) {
  const repository: InventoryRepository = {
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    findById: vi.fn(async () => undefined),
    lockById: vi.fn(async () => undefined),
    lockByVariantId: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    updateBalance: vi.fn(async () => true),
    appendMovement: vi.fn(async () => undefined),
    findMovementByIdempotencyKey: vi.fn(async () => undefined),
    listMovements: vi.fn(async () => ({ items: [], totalItems: 0 })),
    getAvailabilityByVariantIds: vi.fn(async () => new Map()),
    ...overrides,
  };
  const auditEntries: InventoryAuditEntry[] = [];
  const audit: InventoryAuditRepository = {
    async append(_session, entry) {
      auditEntries.push(entry);
    },
  };
  const variantReader: CatalogVariantReader = {
    findById: vi.fn(async () => ({
      id: VARIANT_ID,
      sku: "TECH-PHONE-BLACK",
      status: "active" as const,
    })),
  };
  const transactions: TransactionRunner = {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
    ...transactionOverrides,
  };
  let sequence = 0;
  const service = new InventoryService(
    repository,
    variantReader,
    audit,
    transactions,
    () => `generated-${++sequence}`,
    () => NOW,
  );
  return { auditEntries, repository, service, variantReader };
}

describe("InventoryService", () => {
  it("creates the first balance, movement, and audit atomically", async () => {
    const { auditEntries, repository, service } = dependencies();

    const result = await service.receive(
      { variantId: VARIANT_ID, quantity: 8, idempotencyKey: "receipt-001" },
      context,
    );

    expect(result).toMatchObject({
      variantId: VARIANT_ID,
      sku: "TECH-PHONE-BLACK",
      onHand: 8,
      reserved: 0,
      available: 8,
      stockStatus: "healthy",
    });
    expect(repository.create).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ variantId: VARIANT_ID, onHand: 8, reserved: 0 }),
    );
    expect(repository.appendMovement).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        movementType: "receive",
        onHandDelta: 8,
        reservedDelta: 0,
        idempotencyKey: "receipt-001",
      }),
    );
    expect(auditEntries).toEqual([
      expect.objectContaining({
        action: "inventory.stock.received",
        actorType: "staff",
        actorId: "staff-1",
        resourceType: "inventory_item",
      }),
    ]);
  });

  it("returns the current balance for an idempotent receipt retry", async () => {
    const current = inventoryItem({ onHand: 8, reserved: 0 });
    const { repository, service } = dependencies({
      findMovementByIdempotencyKey: vi.fn(async () => movement()),
      findById: vi.fn(async () => current),
    });

    const result = await service.receive(
      { variantId: VARIANT_ID, quantity: 8, idempotencyKey: "receipt-001" },
      context,
    );

    expect(result).toMatchObject({ onHand: 8, reserved: 0, available: 8 });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateBalance).not.toHaveBeenCalled();
    expect(repository.appendMovement).not.toHaveBeenCalled();
  });

  it("recovers a receipt when a concurrent request wins the idempotency race", async () => {
    const current = inventoryItem({ onHand: 8, reserved: 0 });
    const { service } = dependencies(
      {
        findMovementByIdempotencyKey: vi.fn(async () => movement()),
        findById: vi.fn(async () => current),
      },
      {
        run: vi.fn(async () => {
          throw Object.assign(new Error("duplicate key"), { code: "23505" });
        }),
      },
    );

    await expect(
      service.receive(
        { variantId: VARIANT_ID, quantity: 8, idempotencyKey: "receipt-001" },
        context,
      ),
    ).resolves.toMatchObject({ onHand: 8, available: 8 });
  });

  it("rejects an adjustment that would reduce on-hand below reserved", async () => {
    const { repository, service } = dependencies({
      lockById: vi.fn(async () => inventoryItem({ onHand: 5, reserved: 4 })),
    });

    await expect(
      service.adjust(
        ITEM_ID,
        {
          delta: -2,
          reasonCode: "STOCK_COUNT",
          reasonNote: "Cycle count",
          version: 1,
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "INVALID_STOCK_ADJUSTMENT" });
    expect(repository.updateBalance).not.toHaveBeenCalled();
    expect(repository.appendMovement).not.toHaveBeenCalled();
  });

  it("enforces inventory write authorization inside the application service", async () => {
    const { repository, service } = dependencies();

    await expect(
      service.receive(
        { variantId: VARIANT_ID, quantity: 1, idempotencyKey: "receipt-002" },
        { ...context, roles: ["catalog_manager"] },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
