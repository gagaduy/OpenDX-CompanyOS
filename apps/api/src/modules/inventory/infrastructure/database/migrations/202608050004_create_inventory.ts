// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("inventory_items", {
    id: { type: "uuid", primaryKey: true },
    variant_id: {
      type: "uuid",
      notNull: true,
      unique: true,
      references: "product_variants",
      onDelete: "RESTRICT",
    },
    on_hand: { type: "integer", notNull: true, default: 0 },
    reserved: { type: "integer", notNull: true, default: 0 },
    version: { type: "integer", notNull: true, default: 1 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("inventory_items", "inventory_items_on_hand_check", {
    check: "on_hand >= 0",
  });
  pgm.addConstraint("inventory_items", "inventory_items_reserved_check", {
    check: "reserved >= 0",
  });
  pgm.addConstraint("inventory_items", "inventory_items_available_check", {
    check: "on_hand - reserved >= 0",
  });
  pgm.addConstraint("inventory_items", "inventory_items_version_check", {
    check: "version > 0",
  });

  pgm.createTable("inventory_reservations", {
    id: { type: "uuid", primaryKey: true },
    reference_type: { type: "text", notNull: true },
    reference_id: { type: "text", notNull: true },
    variant_id: {
      type: "uuid",
      notNull: true,
      references: "product_variants",
      onDelete: "RESTRICT",
    },
    quantity: { type: "integer", notNull: true },
    status: { type: "text", notNull: true },
    expires_at: { type: "timestamptz", notNull: true },
    finalized_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint(
    "inventory_reservations",
    "inventory_reservations_reference_type_check",
    { check: "reference_type IN ('checkout', 'order')" },
  );
  pgm.addConstraint(
    "inventory_reservations",
    "inventory_reservations_quantity_check",
    { check: "quantity > 0" },
  );
  pgm.addConstraint(
    "inventory_reservations",
    "inventory_reservations_status_check",
    { check: "status IN ('active', 'released', 'expired', 'consumed')" },
  );
  pgm.addConstraint(
    "inventory_reservations",
    "inventory_reservations_reference_variant_unique",
    { unique: ["reference_type", "reference_id", "variant_id"] },
  );
  pgm.createIndex("inventory_reservations", ["status", "expires_at"]);
  pgm.createIndex("inventory_reservations", ["reference_type", "reference_id"]);

  pgm.createTable("stock_movements", {
    id: { type: "uuid", primaryKey: true },
    inventory_item_id: {
      type: "uuid",
      notNull: true,
      references: "inventory_items",
      onDelete: "RESTRICT",
    },
    reservation_id: {
      type: "uuid",
      references: "inventory_reservations",
      onDelete: "RESTRICT",
    },
    movement_type: { type: "text", notNull: true },
    on_hand_delta: { type: "integer", notNull: true, default: 0 },
    reserved_delta: { type: "integer", notNull: true, default: 0 },
    reason_code: { type: "varchar(64)", notNull: true },
    reason_note: { type: "varchar(500)" },
    actor_type: { type: "text", notNull: true },
    actor_id: { type: "varchar(200)", notNull: true },
    correlation_id: { type: "varchar(200)", notNull: true },
    idempotency_key: { type: "varchar(128)" },
    occurred_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("stock_movements", "stock_movements_type_check", {
    check:
      "movement_type IN ('receive', 'adjustment', 'reservation', 'release', 'expiry', 'consume')",
  });
  pgm.addConstraint("stock_movements", "stock_movements_delta_check", {
    check: "on_hand_delta <> 0 OR reserved_delta <> 0",
  });
  pgm.addConstraint("stock_movements", "stock_movements_reason_code_check", {
    check: "length(trim(reason_code)) > 0",
  });
  pgm.addConstraint("stock_movements", "stock_movements_actor_type_check", {
    check: "actor_type IN ('staff', 'system')",
  });
  pgm.createIndex("stock_movements", ["inventory_item_id", "occurred_at"]);
  pgm.createIndex("stock_movements", "reservation_id");
  pgm.sql(
    `CREATE UNIQUE INDEX stock_movements_idempotency_key_unique
     ON stock_movements (idempotency_key)
     WHERE idempotency_key IS NOT NULL`,
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("stock_movements");
  pgm.dropTable("inventory_reservations");
  pgm.dropTable("inventory_items");
}
