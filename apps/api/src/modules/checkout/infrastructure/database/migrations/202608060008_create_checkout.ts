// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

const MONEY_CHECK = "BETWEEN 0 AND 9007199254740991";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("checkout_sessions", {
    id: { type: "uuid", primaryKey: true },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "RESTRICT" },
    source_cart_id: { type: "uuid", notNull: true, references: "carts", onDelete: "RESTRICT" },
    source_cart_version: { type: "integer", notNull: true },
    address_snapshot: { type: "jsonb", notNull: true },
    contact_snapshot: { type: "jsonb", notNull: true },
    promotion_id: { type: "uuid", references: "promotions", onDelete: "RESTRICT" },
    promotion_code: { type: "varchar(64)" },
    promotion_version: { type: "integer" },
    subtotal_vnd: { type: "bigint", notNull: true },
    discount_vnd: { type: "bigint", notNull: true, default: 0 },
    total_vnd: { type: "bigint", notNull: true },
    currency: { type: "char(3)", notNull: true, default: "VND" },
    tax_mode: { type: "text", notNull: true, default: "included_not_separated" },
    status: { type: "text", notNull: true },
    idempotency_key: { type: "varchar(128)", notNull: true },
    request_fingerprint: { type: "char(64)", notNull: true },
    order_id: { type: "uuid" },
    expires_at: { type: "timestamptz", notNull: true },
    completed_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_customer_key_unique", { unique: ["customer_id", "idempotency_key"] });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_order_unique", { unique: ["order_id"] });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_cart_version_check", { check: "source_cart_version > 0" });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_money_check", { check: `subtotal_vnd ${MONEY_CHECK} AND discount_vnd ${MONEY_CHECK} AND total_vnd BETWEEN 1 AND 9007199254740991 AND discount_vnd <= subtotal_vnd AND total_vnd = subtotal_vnd - discount_vnd` });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_currency_check", { check: "currency = 'VND'" });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_tax_mode_check", { check: "tax_mode = 'included_not_separated'" });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_status_check", { check: "status IN ('created', 'order_created', 'completed', 'expired', 'canceled')" });
  pgm.addConstraint("checkout_sessions", "checkout_sessions_fingerprint_check", { check: "request_fingerprint ~ '^[a-f0-9]{64}$'" });

  pgm.createTable("checkout_session_lines", {
    id: { type: "uuid", primaryKey: true },
    checkout_id: { type: "uuid", notNull: true, references: "checkout_sessions", onDelete: "CASCADE" },
    variant_id: { type: "uuid", notNull: true, references: "product_variants", onDelete: "RESTRICT" },
    sku: { type: "varchar(96)", notNull: true },
    product_title: { type: "varchar(240)", notNull: true },
    variant_label: { type: "varchar(240)", notNull: true },
    quantity: { type: "integer", notNull: true },
    unit_price_vnd: { type: "bigint", notNull: true },
    line_subtotal_vnd: { type: "bigint", notNull: true },
    line_position: { type: "integer", notNull: true },
  });
  pgm.addConstraint("checkout_session_lines", "checkout_session_lines_position_unique", { unique: ["checkout_id", "line_position"] });
  pgm.addConstraint("checkout_session_lines", "checkout_session_lines_variant_unique", { unique: ["checkout_id", "variant_id"] });
  pgm.addConstraint("checkout_session_lines", "checkout_session_lines_values_check", { check: "quantity > 0 AND line_position >= 0 AND unit_price_vnd BETWEEN 0 AND 9007199254740991 AND line_subtotal_vnd BETWEEN 0 AND 9007199254740991 AND line_subtotal_vnd = unit_price_vnd * quantity" });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("checkout_session_lines");
  pgm.dropTable("checkout_sessions");
}
