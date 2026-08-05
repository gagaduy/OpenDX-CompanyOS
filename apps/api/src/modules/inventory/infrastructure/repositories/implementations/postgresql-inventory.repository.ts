// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { InventoryItem } from "../../../domain/entities/inventory-item";
import type {
  InventoryReservation,
  InventoryReservationReferenceType,
  InventoryReservationStatus,
} from "../../../domain/entities/inventory-reservation";
import type { StockMovement, StockMovementType } from "../../../domain/entities/stock-movement";
import type {
  InventoryAvailability,
  InventoryItemResponseDto,
  InventoryListQuery,
  InventoryStockStatus,
} from "../../../application/dtos/inventory.dto";
import type {
  InventoryListResult,
  InventoryRepository,
  MovementListResult,
} from "../../../application/repositories/interfaces/inventory.repository";

interface InventoryItemRow {
  id: string;
  variant_id: string;
  on_hand: number;
  reserved: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface InventoryListRow extends InventoryItemRow {
  sku: string;
  variant_title: string;
  product_name: string;
  category_id: string;
  category_name: string;
  primary_media_id: string | null;
}

interface MovementRow {
  id: string;
  inventory_item_id: string;
  reservation_id: string | null;
  movement_type: string;
  on_hand_delta: number;
  reserved_delta: number;
  reason_code: string;
  reason_note: string | null;
  actor_type: string;
  actor_id: string;
  correlation_id: string;
  idempotency_key: string | null;
  occurred_at: Date | string;
}

interface ReservationRow {
  id: string;
  reference_type: string;
  reference_id: string;
  variant_id: string;
  quantity: number;
  status: string;
  expires_at: Date | string;
  finalized_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const itemColumns = `id, variant_id, on_hand, reserved, version,
  created_at, updated_at`;

export class PostgresqlInventoryRepository implements InventoryRepository {
  async list(
    session: DatabaseSession,
    query: InventoryListQuery,
  ): Promise<InventoryListResult> {
    const values: unknown[] = [];
    const where: string[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.query !== undefined && query.query.trim().length > 0) {
      const parameter = bind(`%${query.query.trim()}%`);
      where.push(`(variant.sku ILIKE ${parameter} OR product.name ILIKE ${parameter})`);
    }
    if (query.categoryId !== undefined) {
      where.push(`category.id = ${bind(query.categoryId)}`);
    }
    if (query.stockStatus !== undefined) {
      const expression = "item.on_hand - item.reserved";
      if (query.stockStatus === "out_of_stock") where.push(`${expression} = 0`);
      if (query.stockStatus === "low") where.push(`${expression} BETWEEN 1 AND 5`);
      if (query.stockStatus === "healthy") where.push(`${expression} >= 6`);
    }
    const whereSql = where.length === 0 ? "" : `WHERE ${where.join(" AND ")}`;
    const joins = `FROM inventory_items item
      JOIN product_variants variant ON variant.id = item.variant_id
      JOIN products product ON product.id = variant.product_id
      JOIN categories category ON category.id = product.category_id`;
    const count = await session.query<{ total: string }>(
      `SELECT count(*)::text AS total ${joins} ${whereSql}`,
      values,
    );
    const limit = bind(query.pageSize);
    const offset = bind((query.page - 1) * query.pageSize);
    const result = await session.query<InventoryListRow>(
      `SELECT item.id, item.variant_id, item.on_hand, item.reserved,
              item.version, item.created_at, item.updated_at,
              variant.sku, variant.title AS variant_title,
              product.name AS product_name, category.id AS category_id,
              category.name AS category_name,
              (SELECT media.id FROM product_media media
               WHERE media.product_id = product.id AND media.is_primary = true
               LIMIT 1) AS primary_media_id
       ${joins} ${whereSql}
       ORDER BY item.updated_at DESC, item.id ASC
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      items: result.rows.map(mapListRow),
      totalItems: Number(count.rows[0]?.total ?? 0),
    };
  }

  async findById(
    session: DatabaseSession,
    id: string,
  ): Promise<InventoryItem | undefined> {
    return this.findOne(session, `id = $1`, [id]);
  }

  async lockById(
    session: DatabaseSession,
    id: string,
  ): Promise<InventoryItem | undefined> {
    return this.findOne(session, `id = $1 FOR UPDATE`, [id]);
  }

  async lockByVariantId(
    session: DatabaseSession,
    variantId: string,
  ): Promise<InventoryItem | undefined> {
    return this.findOne(session, `variant_id = $1 FOR UPDATE`, [variantId]);
  }

  async create(session: DatabaseSession, item: InventoryItem): Promise<void> {
    await session.query(
      `INSERT INTO inventory_items
        (id, variant_id, on_hand, reserved, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        item.id,
        item.variantId,
        item.onHand,
        item.reserved,
        item.version,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }

  async updateBalance(
    session: DatabaseSession,
    item: InventoryItem,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE inventory_items
       SET on_hand = $2, reserved = $3, version = $4, updated_at = $5
       WHERE id = $1 AND version = $6`,
      [
        item.id,
        item.onHand,
        item.reserved,
        item.version,
        item.updatedAt,
        expectedVersion,
      ],
    );
    return result.rowCount === 1;
  }

  async appendMovement(
    session: DatabaseSession,
    movement: StockMovement,
  ): Promise<void> {
    await session.query(
      `INSERT INTO stock_movements
        (id, inventory_item_id, reservation_id, movement_type,
         on_hand_delta, reserved_delta, reason_code, reason_note,
         actor_type, actor_id, correlation_id, idempotency_key, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        movement.id,
        movement.inventoryItemId,
        movement.reservationId ?? null,
        movement.movementType,
        movement.onHandDelta,
        movement.reservedDelta,
        movement.reasonCode,
        movement.reasonNote ?? null,
        movement.actorType,
        movement.actorId,
        movement.correlationId,
        movement.idempotencyKey ?? null,
        movement.occurredAt,
      ],
    );
  }

  async findMovementByIdempotencyKey(
    session: DatabaseSession,
    key: string,
  ): Promise<StockMovement | undefined> {
    const result = await session.query<MovementRow>(
      `SELECT * FROM stock_movements WHERE idempotency_key = $1`,
      [key],
    );
    return result.rows[0] === undefined ? undefined : mapMovement(result.rows[0]);
  }

  async listMovements(
    session: DatabaseSession,
    itemId: string,
    page: number,
    pageSize: number,
  ): Promise<MovementListResult> {
    const count = await session.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM stock_movements
       WHERE inventory_item_id = $1`,
      [itemId],
    );
    const result = await session.query<MovementRow>(
      `SELECT * FROM stock_movements
       WHERE inventory_item_id = $1
       ORDER BY occurred_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [itemId, pageSize, (page - 1) * pageSize],
    );
    return {
      items: result.rows.map(mapMovement),
      totalItems: Number(count.rows[0]?.total ?? 0),
    };
  }

  async getAvailabilityByVariantIds(
    session: DatabaseSession,
    variantIds: readonly string[],
  ): Promise<ReadonlyMap<string, InventoryAvailability>> {
    const availability = new Map<string, InventoryAvailability>(
      variantIds.map((variantId) => [
        variantId,
        { initialized: false, onHand: 0, reserved: 0, available: 0 },
      ]),
    );
    if (variantIds.length === 0) return availability;
    const result = await session.query<{
      variant_id: string;
      on_hand: number;
      reserved: number;
    }>(
      `SELECT variant_id, on_hand, reserved FROM inventory_items
       WHERE variant_id = ANY($1::uuid[])`,
      [variantIds],
    );
    for (const row of result.rows) {
      availability.set(row.variant_id, {
        initialized: true,
        onHand: row.on_hand,
        reserved: row.reserved,
        available: row.on_hand - row.reserved,
      });
    }
    return availability;
  }

  async findReservationGroup(
    session: DatabaseSession,
    referenceType: InventoryReservationReferenceType,
    referenceId: string,
  ): Promise<readonly InventoryReservation[]> {
    return this.reservationGroup(session, referenceType, referenceId, false);
  }

  async lockReservationGroup(
    session: DatabaseSession,
    referenceType: InventoryReservationReferenceType,
    referenceId: string,
  ): Promise<readonly InventoryReservation[]> {
    return this.reservationGroup(session, referenceType, referenceId, true);
  }

  async createReservation(
    session: DatabaseSession,
    reservation: InventoryReservation,
  ): Promise<void> {
    await session.query(
      `INSERT INTO inventory_reservations
        (id, reference_type, reference_id, variant_id, quantity, status,
         expires_at, finalized_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        reservation.id,
        reservation.referenceType,
        reservation.referenceId,
        reservation.variantId,
        reservation.quantity,
        reservation.status,
        reservation.expiresAt,
        reservation.finalizedAt ?? null,
        reservation.createdAt,
        reservation.updatedAt,
      ],
    );
  }

  async updateReservation(
    session: DatabaseSession,
    reservation: InventoryReservation,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE inventory_reservations
       SET status = $2, finalized_at = $3, updated_at = $4
       WHERE id = $1 AND status = 'active'`,
      [
        reservation.id,
        reservation.status,
        reservation.finalizedAt ?? null,
        reservation.updatedAt,
      ],
    );
    return result.rowCount === 1;
  }

  async lockDueReservations(
    session: DatabaseSession,
    now: string,
    limit: number,
  ): Promise<readonly InventoryReservation[]> {
    const result = await session.query<ReservationRow>(
      `SELECT * FROM inventory_reservations
       WHERE status = 'active' AND expires_at <= $1
       ORDER BY expires_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT $2`,
      [now, limit],
    );
    return result.rows.map(mapReservation);
  }

  private async findOne(
    session: DatabaseSession,
    predicate: string,
    values: readonly unknown[],
  ): Promise<InventoryItem | undefined> {
    const result = await session.query<InventoryItemRow>(
      `SELECT ${itemColumns} FROM inventory_items WHERE ${predicate}`,
      values,
    );
    return result.rows[0] === undefined ? undefined : mapItemRow(result.rows[0]);
  }

  private async reservationGroup(
    session: DatabaseSession,
    referenceType: InventoryReservationReferenceType,
    referenceId: string,
    lock: boolean,
  ): Promise<readonly InventoryReservation[]> {
    const result = await session.query<ReservationRow>(
      `SELECT * FROM inventory_reservations
       WHERE reference_type = $1 AND reference_id = $2
       ORDER BY variant_id
       ${lock ? "FOR UPDATE" : ""}`,
      [referenceType, referenceId],
    );
    return result.rows.map(mapReservation);
  }
}

function mapItemRow(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    variantId: row.variant_id,
    onHand: row.on_hand,
    reserved: row.reserved,
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapListRow(row: InventoryListRow): InventoryItemResponseDto {
  const available = row.on_hand - row.reserved;
  return {
    ...mapItemRow(row),
    sku: row.sku,
    productName: row.product_name,
    variantTitle: row.variant_title,
    categoryId: row.category_id,
    categoryName: row.category_name,
    ...(row.primary_media_id === null
      ? {}
      : { primaryMediaId: row.primary_media_id }),
    available,
    stockStatus: stockStatus(available),
  };
}

function mapMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    ...(row.reservation_id === null ? {} : { reservationId: row.reservation_id }),
    movementType: movementType(row.movement_type),
    onHandDelta: row.on_hand_delta,
    reservedDelta: row.reserved_delta,
    reasonCode: row.reason_code,
    ...(row.reason_note === null ? {} : { reasonNote: row.reason_note }),
    actorType: row.actor_type === "system" ? "system" : "staff",
    actorId: row.actor_id,
    correlationId: row.correlation_id,
    ...(row.idempotency_key === null
      ? {}
      : { idempotencyKey: row.idempotency_key }),
    occurredAt: toIso(row.occurred_at),
  };
}

function mapReservation(row: ReservationRow): InventoryReservation {
  return {
    id: row.id,
    referenceType: row.reference_type === "order" ? "order" : "checkout",
    referenceId: row.reference_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    status: reservationStatus(row.status),
    expiresAt: toIso(row.expires_at),
    ...(row.finalized_at === null ? {} : { finalizedAt: toIso(row.finalized_at) }),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function movementType(value: string): StockMovementType {
  if (
    value !== "receive" &&
    value !== "adjustment" &&
    value !== "reservation" &&
    value !== "release" &&
    value !== "expiry" &&
    value !== "consume"
  ) {
    throw new Error(`Invalid stock movement type: ${value}`);
  }
  return value;
}

function reservationStatus(value: string): InventoryReservationStatus {
  if (
    value !== "active" &&
    value !== "released" &&
    value !== "expired" &&
    value !== "consumed"
  ) {
    throw new Error(`Invalid inventory reservation status: ${value}`);
  }
  return value;
}

function stockStatus(available: number): InventoryStockStatus {
  if (available === 0) return "out_of_stock";
  if (available <= 5) return "low";
  return "healthy";
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
