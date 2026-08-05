// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { CatalogVariantReader } from "../catalog";
import { authenticateStaff, type StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { InventoryReservationService } from "./application/services/implementations/inventory-reservation.service";
import { InventoryService } from "./application/services/implementations/inventory.service";
import { PostgresqlInventoryAuditRepository } from "./infrastructure/repositories/implementations/postgresql-inventory-audit.repository";
import { PostgresqlInventoryRepository } from "./infrastructure/repositories/implementations/postgresql-inventory.repository";
import { ReservationExpiryWorker } from "./infrastructure/workers/reservation-expiry.worker";
import { InventoryController } from "./presentation/controllers/inventory.controller";
import { createInventoryRouter } from "./presentation/routes/inventory.routes";

export interface InventoryModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly variantReader: CatalogVariantReader;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly reservationTtlMs: number;
  readonly expiryIntervalMs: number;
  readonly onWorkerError: (error: unknown) => void;
}

export function createInventoryModule(dependencies: InventoryModuleDependencies) {
  const repository = new PostgresqlInventoryRepository();
  const audit = new PostgresqlInventoryAuditRepository();
  const service = new InventoryService(
    repository,
    dependencies.variantReader,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const reservations = new InventoryReservationService(
    repository,
    dependencies.variantReader,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
    dependencies.reservationTtlMs,
  );
  const appendDenied = async (denied: {
    actorId: string; action: string; resourceId: string; correlationId: string;
  }) => dependencies.transactions.run((session) => audit.append(session, {
    id: dependencies.generateId(),
    actorType: "staff",
    actorId: denied.actorId,
    action: denied.action,
    resourceType: "inventory_item",
    resourceId: denied.resourceId,
    outcome: "denied",
    correlationId: denied.correlationId,
    metadata: {},
    occurredAt: dependencies.now(),
  }));
  const router: Router = createInventoryRouter(
    new InventoryController(service),
    authenticateStaff(dependencies.staffTokenVerifier),
    appendDenied,
  );
  const expiryWorker = new ReservationExpiryWorker(
    reservations,
    {
      actorType: "system",
      actorId: "system:reservation-expiry",
      correlationId: "reservation-expiry-worker",
    },
    dependencies.expiryIntervalMs,
    dependencies.onWorkerError,
  );
  return { router, availability: service, reservations, expiryWorker };
}
