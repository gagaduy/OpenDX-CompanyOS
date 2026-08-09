// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("orders", {
    id: { type: "uuid", primaryKey: true },
    public_number: { type: "varchar(32)", notNull: true },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "RESTRICT" },
    checkout_id: { type: "uuid", notNull: true, references: "checkout_sessions", onDelete: "RESTRICT" },
    address_snapshot: { type: "jsonb", notNull: true },
    contact_snapshot: { type: "jsonb", notNull: true },
    promotion_code: { type: "varchar(64)" },
    subtotal_vnd: { type: "bigint", notNull: true },
    discount_vnd: { type: "bigint", notNull: true, default: 0 },
    total_vnd: { type: "bigint", notNull: true },
    currency: { type: "char(3)", notNull: true, default: "VND" },
    tax_mode: { type: "text", notNull: true, default: "included_not_separated" },
    status: { type: "text", notNull: true },
    reservation_expires_at: { type: "timestamptz", notNull: true },
    paid_at: { type: "timestamptz" },
    completed_at: { type: "timestamptz" },
    version: { type: "integer", notNull: true, default: 1 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("orders", "orders_public_number_unique", { unique: ["public_number"] });
  pgm.addConstraint("orders", "orders_checkout_unique", { unique: ["checkout_id"] });
  pgm.addConstraint("orders", "orders_public_number_check", { check: "public_number ~ '^NVC-[0-9]{8}-[A-F0-9]{8}$'" });
  pgm.addConstraint("orders", "orders_money_check", { check: "subtotal_vnd BETWEEN 0 AND 9007199254740991 AND discount_vnd BETWEEN 0 AND 9007199254740991 AND total_vnd BETWEEN 1 AND 9007199254740991 AND discount_vnd <= subtotal_vnd AND total_vnd = subtotal_vnd - discount_vnd" });
  pgm.addConstraint("orders", "orders_currency_check", { check: "currency = 'VND'" });
  pgm.addConstraint("orders", "orders_tax_mode_check", { check: "tax_mode = 'included_not_separated'" });
  pgm.addConstraint("orders", "orders_status_check", { check: "status IN ('pending_payment', 'paid', 'processing', 'ready_for_fulfillment', 'completed', 'canceled', 'expired')" });
  pgm.addConstraint("orders", "orders_version_check", { check: "version > 0" });

  pgm.createTable("order_lines", {
    id: { type: "uuid", primaryKey: true },
    order_id: { type: "uuid", notNull: true, references: "orders", onDelete: "CASCADE" },
    variant_id: { type: "uuid", notNull: true, references: "product_variants", onDelete: "RESTRICT" },
    sku: { type: "varchar(96)", notNull: true },
    product_title: { type: "varchar(240)", notNull: true },
    variant_label: { type: "varchar(240)", notNull: true },
    quantity: { type: "integer", notNull: true },
    unit_price_vnd: { type: "bigint", notNull: true },
    discount_allocation_vnd: { type: "bigint", notNull: true, default: 0 },
    line_total_vnd: { type: "bigint", notNull: true },
    line_position: { type: "integer", notNull: true },
  });
  pgm.addConstraint("order_lines", "order_lines_position_unique", { unique: ["order_id", "line_position"] });
  pgm.addConstraint("order_lines", "order_lines_values_check", { check: "quantity > 0 AND line_position >= 0 AND unit_price_vnd BETWEEN 0 AND 9007199254740991 AND discount_allocation_vnd BETWEEN 0 AND 9007199254740991 AND line_total_vnd BETWEEN 0 AND 9007199254740991 AND line_total_vnd = unit_price_vnd * quantity - discount_allocation_vnd" });

  pgm.createTable("order_status_history", {
    id: { type: "uuid", primaryKey: true },
    order_id: { type: "uuid", notNull: true, references: "orders", onDelete: "CASCADE" },
    previous_status: { type: "text" },
    new_status: { type: "text", notNull: true },
    actor_type: { type: "text", notNull: true },
    actor_id: { type: "varchar(255)", notNull: true },
    reason_code: { type: "varchar(96)", notNull: true },
    idempotency_key: { type: "varchar(128)", notNull: true },
    correlation_id: { type: "varchar(255)", notNull: true },
    occurred_at: { type: "timestamptz", notNull: true },
  });
  pgm.addConstraint("order_status_history", "order_status_history_idempotency_unique", { unique: ["order_id", "idempotency_key"] });
  pgm.addConstraint("order_status_history", "order_status_history_actor_check", { check: "actor_type IN ('customer', 'staff', 'system', 'provider')" });

  pgm.sql("ALTER TABLE checkout_sessions ADD CONSTRAINT checkout_sessions_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT");
  pgm.sql("ALTER TABLE promotion_redemptions ADD CONSTRAINT promotion_redemptions_checkout_fk FOREIGN KEY (checkout_id) REFERENCES checkout_sessions(id) ON DELETE RESTRICT");
  pgm.sql("ALTER TABLE promotion_redemptions ADD CONSTRAINT promotion_redemptions_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT");
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("ALTER TABLE promotion_redemptions DROP CONSTRAINT IF EXISTS promotion_redemptions_order_fk");
  pgm.sql("ALTER TABLE promotion_redemptions DROP CONSTRAINT IF EXISTS promotion_redemptions_checkout_fk");
  pgm.sql("ALTER TABLE checkout_sessions DROP CONSTRAINT IF EXISTS checkout_sessions_order_fk");
  pgm.dropTable("order_status_history");
  pgm.dropTable("order_lines");
  pgm.dropTable("orders");
}
