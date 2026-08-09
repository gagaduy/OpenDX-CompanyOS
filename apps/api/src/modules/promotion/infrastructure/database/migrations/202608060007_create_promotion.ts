// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

const MAX_SAFE_VND = "9007199254740991";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("promotions", {
    id: { type: "uuid", primaryKey: true },
    code: { type: "varchar(64)", notNull: true },
    name: { type: "varchar(160)", notNull: true },
    promotion_type: { type: "text", notNull: true },
    percentage_bps: { type: "integer" },
    fixed_amount_vnd: { type: "bigint" },
    maximum_discount_vnd: { type: "bigint" },
    minimum_subtotal_vnd: { type: "bigint", notNull: true, default: 0 },
    starts_at: { type: "timestamptz" },
    ends_at: { type: "timestamptz" },
    total_usage_limit: { type: "integer" },
    per_customer_limit: { type: "integer" },
    status: { type: "text", notNull: true, default: "draft" },
    version: { type: "integer", notNull: true, default: 1 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("promotions", "promotions_code_unique", { unique: ["code"] });
  pgm.addConstraint("promotions", "promotions_code_normalized_check", { check: "code = upper(btrim(code)) AND code <> ''" });
  pgm.addConstraint("promotions", "promotions_type_value_check", { check: "(promotion_type = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 AND fixed_amount_vnd IS NULL) OR (promotion_type = 'fixed_amount' AND fixed_amount_vnd BETWEEN 1 AND 9007199254740991 AND percentage_bps IS NULL)" });
  pgm.addConstraint("promotions", "promotions_money_check", { check: `minimum_subtotal_vnd BETWEEN 0 AND ${MAX_SAFE_VND} AND (maximum_discount_vnd IS NULL OR maximum_discount_vnd BETWEEN 1 AND ${MAX_SAFE_VND})` });
  pgm.addConstraint("promotions", "promotions_window_check", { check: "starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at" });
  pgm.addConstraint("promotions", "promotions_limits_check", { check: "(total_usage_limit IS NULL OR total_usage_limit > 0) AND (per_customer_limit IS NULL OR per_customer_limit > 0)" });
  pgm.addConstraint("promotions", "promotions_status_check", { check: "status IN ('draft', 'active', 'inactive')" });
  pgm.addConstraint("promotions", "promotions_version_check", { check: "version > 0" });

  pgm.createTable("promotion_redemptions", {
    id: { type: "uuid", primaryKey: true },
    promotion_id: { type: "uuid", notNull: true, references: "promotions", onDelete: "RESTRICT" },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "RESTRICT" },
    checkout_id: { type: "uuid", notNull: true },
    order_id: { type: "uuid" },
    discount_vnd: { type: "bigint", notNull: true },
    state: { type: "text", notNull: true },
    idempotency_key: { type: "varchar(128)", notNull: true },
    expires_at: { type: "timestamptz", notNull: true },
    committed_at: { type: "timestamptz" },
    released_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("promotion_redemptions", "promotion_redemptions_checkout_unique", { unique: ["checkout_id"] });
  pgm.addConstraint("promotion_redemptions", "promotion_redemptions_order_unique", { unique: ["order_id"] });
  pgm.addConstraint("promotion_redemptions", "promotion_redemptions_customer_key_unique", { unique: ["customer_id", "idempotency_key"] });
  pgm.addConstraint("promotion_redemptions", "promotion_redemptions_discount_check", { check: `discount_vnd BETWEEN 0 AND ${MAX_SAFE_VND}` });
  pgm.addConstraint("promotion_redemptions", "promotion_redemptions_state_check", { check: "state IN ('held', 'committed', 'released')" });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("promotion_redemptions");
  pgm.dropTable("promotions");
}
