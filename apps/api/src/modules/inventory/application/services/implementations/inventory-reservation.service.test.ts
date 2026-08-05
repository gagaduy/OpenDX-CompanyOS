// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { CatalogVariantReader } from "../../../../catalog";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { InventoryItem } from "../../../domain/entities/inventory-item";
import type { InventoryReservation } from "../../../domain/entities/inventory-reservation";
import type { InventoryAuditEntry, InventoryAuditRepository } from "../../repositories/interfaces/inventory-audit.repository";
import type { InventoryRepository } from "../../repositories/interfaces/inventory.repository";
import { InventoryReservationService } from "./inventory-reservation.service";

const NOW = "2026-08-05T00:00:00.000Z";
const ITEM_ID = "a1000000-0000-4000-8000-000000000001";
const VARIANT_ID = "a2000000-0000-4000-8000-000000000001";
const session: DatabaseSession = { query: vi.fn() };
const context = {
  actorType: "system" as const,
  actorId: "checkout-service",
  correlationId: "corr-reservation",
};

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: ITEM_ID,
    variantId: VARIANT_ID,
    onHand: 5,
    reserved: 0,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function reservation(
  overrides: Partial<InventoryReservation> = {},
): InventoryReservation {
  return {
    id: "a3000000-0000-4000-8000-000000000001",
    referenceType: "checkout",
    referenceId: "checkout-1",
    variantId: VARIANT_ID,
    quantity: 2,
    status: "active",
    expiresAt: "2026-08-05T00:15:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const repository = {
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    findById: vi.fn(async () => undefined),
    lockById: vi.fn(async () => undefined),
    lockByVariantId: vi.fn(async () => item()),
    create: vi.fn(async () => undefined),
    updateBalance: vi.fn(async () => true),
    appendMovement: vi.fn(async () => undefined),
    findMovementByIdempotencyKey: vi.fn(async () => undefined),
    listMovements: vi.fn(async () => ({ items: [], totalItems: 0 })),
    getAvailabilityByVariantIds: vi.fn(async () => new Map()),
    findReservationGroup: vi.fn(async () => []),
    lockReservationGroup: vi.fn(async () => []),
    createReservation: vi.fn(async () => undefined),
    updateReservation: vi.fn(async () => true),
    lockDueReservations: vi.fn(async () => []),
    ...overrides,
  } as unknown as InventoryRepository;
  const auditEntries: InventoryAuditEntry[] = [];
  const audit: InventoryAuditRepository = {
    async append(_session, entry) {
      auditEntries.push(entry);
    },
  };
  const variants: CatalogVariantReader = {
    findById: vi.fn(async () => ({
      id: VARIANT_ID,
      sku: "TECH-PHONE-BLACK",
      status: "active" as const,
    })),
  };
  const transactions: TransactionRunner = {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
  };
  let sequence = 0;
  const service = new InventoryReservationService(
    repository,
    variants,
    audit,
    transactions,
    () => `generated-${++sequence}`,
    () => NOW,
    15 * 60 * 1000,
  );
  return { auditEntries, repository, service };
}

describe("InventoryReservationService", () => {
  it("reserves stock with a backend-owned fifteen-minute expiry", async () => {
    const { auditEntries, repository, service } = dependencies();

    const result = await service.reserve(
      {
        referenceType: "checkout",
        referenceId: "checkout-1",
        lines: [{ variantId: VARIANT_ID, quantity: 2 }],
      },
      context,
    );

    expect(result).toMatchObject({
      referenceType: "checkout",
      referenceId: "checkout-1",
      status: "active",
      expiresAt: "2026-08-05T00:15:00.000Z",
      lines: [{ variantId: VARIANT_ID, quantity: 2 }],
    });
    expect(repository.updateBalance).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ onHand: 5, reserved: 2 }),
      1,
    );
    expect(repository.appendMovement).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        movementType: "reservation",
        onHandDelta: 0,
        reservedDelta: 2,
      }),
    );
    expect(auditEntries).toEqual([
      expect.objectContaining({
        action: "inventory.stock.reserved",
        actorType: "system",
      }),
    ]);
  });

  it("returns an existing terminal group without applying a second release", async () => {
    const released = reservation({ status: "released", finalizedAt: NOW });
    const { repository, service } = dependencies({
      lockReservationGroup: vi.fn(async () => [released]),
    });

    await expect(
      service.release(
        { referenceType: "checkout", referenceId: "checkout-1" },
        context,
      ),
    ).resolves.toMatchObject({ status: "released" });
    expect(repository.updateBalance).not.toHaveBeenCalled();
    expect(repository.appendMovement).not.toHaveBeenCalled();
  });

  it("consumes held stock exactly once", async () => {
    const active = reservation();
    const { repository, service } = dependencies({
      lockReservationGroup: vi.fn(async () => [active]),
      lockByVariantId: vi.fn(async () => item({ reserved: 2 })),
    });

    await expect(
      service.consume(
        { referenceType: "checkout", referenceId: "checkout-1" },
        context,
      ),
    ).resolves.toMatchObject({ status: "consumed" });
    expect(repository.updateBalance).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ onHand: 3, reserved: 0 }),
      1,
    );
    expect(repository.appendMovement).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        movementType: "consume",
        onHandDelta: -2,
        reservedDelta: -2,
      }),
    );
    expect(repository.updateReservation).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ status: "consumed", finalizedAt: NOW }),
    );
  });
});
