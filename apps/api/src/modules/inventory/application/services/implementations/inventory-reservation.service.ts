// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CatalogVariantReader } from "../../../../catalog";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { InventoryItem } from "../../../domain/entities/inventory-item";
import type {
  InventoryReservation,
  InventoryReservationStatus,
  InventoryReservationTerminalStatus,
} from "../../../domain/entities/inventory-reservation";
import type { StockMovement, StockMovementType } from "../../../domain/entities/stock-movement";
import {
  applyConsume,
  applyRelease,
  applyReservation,
  finalizeReservation,
} from "../../../domain/services/inventory-rules";
import type { InventorySystemContext } from "../../dtos/inventory.dto";
import type { InventoryAuditRepository } from "../../repositories/interfaces/inventory-audit.repository";
import type { InventoryRepository } from "../../repositories/interfaces/inventory.repository";
import { InventoryApplicationError } from "../inventory-application.error";
import type {
  InventoryReservationPort,
  ReservationGroupDto,
  ReservationReference,
  ReserveInventoryRequest,
} from "../interfaces/inventory-reservations";

export class InventoryReservationService implements InventoryReservationPort {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly variants: CatalogVariantReader,
    private readonly audit: InventoryAuditRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly reservationTtlMs: number,
  ) {}

  async reserve(
    request: ReserveInventoryRequest,
    context: InventorySystemContext,
  ): Promise<ReservationGroupDto> {
    assertReservationLines(request.lines);
    try {
      return await this.transactions.run(async (session) => {
        await this.repository.lockReservationReference(
          session,
          request.referenceType,
          request.referenceId,
        );
        const existing = await this.repository.findReservationGroup(
          session,
          request.referenceType,
          request.referenceId,
        );
        if (existing.length > 0) {
          assertMatchingRequest(existing, request);
          return mapGroup(existing);
        }

        const lines = [...request.lines].sort((left, right) =>
          left.variantId.localeCompare(right.variantId),
        );
        for (const line of lines) {
          const variant = await this.variants.findById(session, line.variantId);
          if (variant === undefined || variant.status !== "active") {
            throw new InventoryApplicationError(
              variant === undefined ? "VARIANT_NOT_FOUND" : "VARIANT_NOT_ACTIVE",
              variant === undefined ? "Variant not found" : "Variant is not active",
            );
          }
        }

        const timestamp = this.now();
        const expiresAt = new Date(
          new Date(timestamp).getTime() + this.reservationTtlMs,
        ).toISOString();
        const reservations: InventoryReservation[] = [];
        for (const line of lines) {
          const current = await this.repository.lockByVariantId(session, line.variantId);
          if (current === undefined) {
            throw new InventoryApplicationError(
              "INVENTORY_ITEM_NOT_FOUND",
              "Inventory item not found",
            );
          }
          const reservation: InventoryReservation = {
            id: this.generateId(),
            referenceType: request.referenceType,
            referenceId: request.referenceId,
            variantId: line.variantId,
            quantity: line.quantity,
            status: "active",
            expiresAt,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          const updated = applyReservation(current, line.quantity, timestamp);
          await this.persistBalance(session, current, updated);
          await this.repository.createReservation(session, reservation);
          await this.appendMovement(
            session,
            current.id,
            reservation,
            "reservation",
            0,
            line.quantity,
            "INVENTORY_RESERVED",
            context,
            timestamp,
          );
          await this.appendAudit(
            session,
            current.id,
            reservation,
            "inventory.stock.reserved",
            context,
            timestamp,
          );
          reservations.push(reservation);
        }
        return mapGroup(reservations);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.transactions.runReadOnly(async (session) => {
        const existing = await this.repository.findReservationGroup(
          session,
          request.referenceType,
          request.referenceId,
        );
        if (existing.length === 0) throw error;
        assertMatchingRequest(existing, request);
        return mapGroup(existing);
      });
    }
  }

  release(
    reference: ReservationReference,
    context: InventorySystemContext,
  ): Promise<ReservationGroupDto> {
    return this.finalize(reference, "released", context);
  }

  consume(
    reference: ReservationReference,
    context: InventorySystemContext,
  ): Promise<ReservationGroupDto> {
    return this.finalize(reference, "consumed", context);
  }

  async expireDue(
    limit: number,
    context: InventorySystemContext,
  ): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new InventoryApplicationError("CONFLICT", "Expiry limit is invalid");
    }
    return this.transactions.run(async (session) => {
      const timestamp = this.now();
      const due = await this.repository.lockDueReservations(session, timestamp, limit);
      const variants = [...new Set(due.map(({ variantId }) => variantId))].sort();
      const items = new Map<string, InventoryItem>();
      for (const variantId of variants) {
        const current = await this.repository.lockByVariantId(session, variantId);
        if (current === undefined) {
          throw new InventoryApplicationError(
            "INVENTORY_ITEM_NOT_FOUND",
            "Inventory item not found",
          );
        }
        items.set(variantId, current);
      }
      for (const reservation of due) {
        const current = items.get(reservation.variantId)!;
        const updated = applyRelease(current, reservation.quantity, timestamp);
        await this.persistBalance(session, current, updated);
        items.set(reservation.variantId, updated);
        const expired = finalizeReservation(reservation, "expired", timestamp);
        await this.repository.updateReservation(session, expired);
        await this.appendMovement(
          session,
          current.id,
          reservation,
          "expiry",
          0,
          -reservation.quantity,
          "RESERVATION_EXPIRED",
          context,
          timestamp,
        );
        await this.appendAudit(
          session,
          current.id,
          expired,
          "inventory.stock.expired",
          context,
          timestamp,
        );
      }
      return due.length;
    });
  }

  private async finalize(
    reference: ReservationReference,
    terminalStatus: Extract<InventoryReservationTerminalStatus, "released" | "consumed">,
    context: InventorySystemContext,
  ): Promise<ReservationGroupDto> {
    return this.transactions.run(async (session) => {
      const reservations = await this.repository.lockReservationGroup(
        session,
        reference.referenceType,
        reference.referenceId,
      );
      if (reservations.length === 0) {
        throw new InventoryApplicationError(
          "RESERVATION_NOT_FOUND",
          "Inventory reservation not found",
        );
      }
      if (reservations.every(({ status }) => status !== "active")) {
        return mapGroup(reservations);
      }
      if (reservations.some(({ status }) => status !== "active")) {
        throw new InventoryApplicationError(
          "CONFLICT",
          "Reservation group has inconsistent states",
        );
      }

      const timestamp = this.now();
      const overdue = reservations.some(
        ({ expiresAt }) => new Date(expiresAt).getTime() <= new Date(timestamp).getTime(),
      );
      if (overdue && terminalStatus === "consumed") {
        throw new InventoryApplicationError(
          "RESERVATION_EXPIRED",
          "Inventory reservation has expired",
        );
      }
      const effectiveStatus: InventoryReservationTerminalStatus = overdue
        ? "expired"
        : terminalStatus;
      const ordered = [...reservations].sort((left, right) =>
        left.variantId.localeCompare(right.variantId),
      );
      const finalized: InventoryReservation[] = [];
      for (const reservation of ordered) {
        const current = await this.repository.lockByVariantId(
          session,
          reservation.variantId,
        );
        if (current === undefined) {
          throw new InventoryApplicationError(
            "INVENTORY_ITEM_NOT_FOUND",
            "Inventory item not found",
          );
        }
        const updated =
          effectiveStatus === "consumed"
            ? applyConsume(current, reservation.quantity, timestamp)
            : applyRelease(current, reservation.quantity, timestamp);
        await this.persistBalance(session, current, updated);
        const terminal = finalizeReservation(reservation, effectiveStatus, timestamp);
        await this.repository.updateReservation(session, terminal);
        await this.appendMovement(
          session,
          current.id,
          reservation,
          effectiveStatus === "consumed" ? "consume" : effectiveStatus === "expired" ? "expiry" : "release",
          effectiveStatus === "consumed" ? -reservation.quantity : 0,
          -reservation.quantity,
          effectiveStatus === "consumed" ? "RESERVATION_CONSUMED" : effectiveStatus === "expired" ? "RESERVATION_EXPIRED" : "RESERVATION_RELEASED",
          context,
          timestamp,
        );
        await this.appendAudit(
          session,
          current.id,
          terminal,
          effectiveStatus === "consumed"
            ? "inventory.stock.consumed"
            : effectiveStatus === "expired"
              ? "inventory.stock.expired"
              : "inventory.stock.released",
          context,
          timestamp,
        );
        finalized.push(terminal);
      }
      return mapGroup(finalized);
    });
  }

  private async persistBalance(
    session: DatabaseSession,
    current: InventoryItem,
    updated: InventoryItem,
  ): Promise<void> {
    if (!(await this.repository.updateBalance(session, updated, current.version))) {
      throw new InventoryApplicationError(
        "STALE_VERSION",
        "Inventory version is stale",
      );
    }
  }

  private async appendMovement(
    session: DatabaseSession,
    inventoryItemId: string,
    reservation: InventoryReservation,
    movementType: StockMovementType,
    onHandDelta: number,
    reservedDelta: number,
    reasonCode: string,
    context: InventorySystemContext,
    occurredAt: string,
  ): Promise<void> {
    const movement: StockMovement = {
      id: this.generateId(),
      inventoryItemId,
      reservationId: reservation.id,
      movementType,
      onHandDelta,
      reservedDelta,
      reasonCode,
      actorType: context.actorType,
      actorId: context.actorId,
      correlationId: context.correlationId,
      occurredAt,
    };
    await this.repository.appendMovement(session, movement);
  }

  private async appendAudit(
    session: DatabaseSession,
    inventoryItemId: string,
    reservation: InventoryReservation,
    action: string,
    context: InventorySystemContext,
    occurredAt: string,
  ): Promise<void> {
    await this.audit.append(session, {
      id: this.generateId(),
      actorType: context.actorType,
      actorId: context.actorId,
      action,
      resourceType: "inventory_item",
      resourceId: inventoryItemId,
      outcome: "success",
      correlationId: context.correlationId,
      metadata: {
        reservationId: reservation.id,
        referenceType: reservation.referenceType,
        referenceId: reservation.referenceId,
        quantity: reservation.quantity,
      },
      occurredAt,
    });
  }
}

function assertReservationLines(
  lines: ReserveInventoryRequest["lines"],
): void {
  if (lines.length === 0 || lines.length > 100) {
    throw new InventoryApplicationError("CONFLICT", "Reservation lines are invalid");
  }
  const variants = new Set<string>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new InventoryApplicationError("CONFLICT", "Reservation quantity is invalid");
    }
    if (variants.has(line.variantId)) {
      throw new InventoryApplicationError("CONFLICT", "Reservation contains duplicate variants");
    }
    variants.add(line.variantId);
  }
}

function assertMatchingRequest(
  existing: readonly InventoryReservation[],
  request: ReserveInventoryRequest,
): void {
  const expected = [...request.lines]
    .map(({ variantId, quantity }) => `${variantId}:${quantity}`)
    .sort();
  const actual = existing
    .map(({ variantId, quantity }) => `${variantId}:${quantity}`)
    .sort();
  if (
    expected.length !== actual.length ||
    expected.some((value, index) => value !== actual[index])
  ) {
    throw new InventoryApplicationError(
      "CONFLICT",
      "Reservation reference belongs to another request",
    );
  }
}

function mapGroup(
  reservations: readonly InventoryReservation[],
): ReservationGroupDto {
  const first = reservations[0];
  if (first === undefined) {
    throw new InventoryApplicationError("RESERVATION_NOT_FOUND", "Reservation not found");
  }
  const status: InventoryReservationStatus = reservations.every(
    (reservation) => reservation.status === first.status,
  )
    ? first.status
    : "active";
  return {
    referenceType: first.referenceType,
    referenceId: first.referenceId,
    status,
    expiresAt: first.expiresAt,
    lines: reservations.map((reservation) => ({
      reservationId: reservation.id,
      variantId: reservation.variantId,
      quantity: reservation.quantity,
      status: reservation.status,
    })),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
