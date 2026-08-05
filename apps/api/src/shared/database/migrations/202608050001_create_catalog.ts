// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("categories", {
    id: { type: "uuid", primaryKey: true },
    parent_id: {
      type: "uuid",
      references: "categories",
      onDelete: "RESTRICT",
    },
    name: { type: "text", notNull: true, check: "length(trim(name)) > 0" },
    slug: { type: "text", notNull: true },
    description: { type: "text" },
    sort_order: { type: "integer", notNull: true, default: 0, check: "sort_order >= 0" },
    status: { type: "text", notNull: true, check: "status IN ('active', 'archived')" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    version: { type: "integer", notNull: true, default: 1, check: "version > 0" },
  });
  pgm.sql("CREATE UNIQUE INDEX categories_slug_ci_unique ON categories (lower(slug))");
  pgm.createIndex("categories", "parent_id");

  pgm.createTable("products", {
    id: { type: "uuid", primaryKey: true },
    category_id: { type: "uuid", notNull: true, references: "categories", onDelete: "RESTRICT" },
    name: { type: "text", notNull: true, check: "length(trim(name)) > 0" },
    slug: { type: "text", notNull: true, unique: true },
    brand: { type: "text" },
    description: { type: "text", notNull: true, check: "length(trim(description)) > 0" },
    attributes: { type: "jsonb", notNull: true, default: "{}" },
    status: { type: "text", notNull: true, check: "status IN ('draft', 'archived')" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    version: { type: "integer", notNull: true, default: 1, check: "version > 0" },
  });
  pgm.createIndex("products", "category_id");
  pgm.createIndex("products", "status");

  pgm.createTable("product_variants", {
    id: { type: "uuid", primaryKey: true },
    product_id: { type: "uuid", notNull: true, references: "products", onDelete: "CASCADE" },
    sku: { type: "text", notNull: true, unique: true },
    title: { type: "text", notNull: true, check: "length(trim(title)) > 0" },
    option_values: { type: "jsonb", notNull: true },
    status: { type: "text", notNull: true, check: "status IN ('active', 'archived')" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    version: { type: "integer", notNull: true, default: 1, check: "version > 0" },
  });
  pgm.createIndex("product_variants", "product_id");

  pgm.createTable("product_prices", {
    id: { type: "uuid", primaryKey: true },
    variant_id: { type: "uuid", notNull: true, references: "product_variants", onDelete: "CASCADE" },
    amount_minor: { type: "bigint", notNull: true, check: "amount_minor > 0" },
    currency: { type: "text", notNull: true, default: "VND", check: "currency = 'VND'" },
    tax_inclusive: { type: "boolean", notNull: true, default: true, check: "tax_inclusive = true" },
    valid_from: { type: "timestamptz", notNull: true },
    valid_to: { type: "timestamptz" },
    created_by: { type: "text", notNull: true },
  });
  pgm.createIndex("product_prices", "variant_id");
  pgm.sql("CREATE UNIQUE INDEX product_prices_one_current_per_variant ON product_prices (variant_id) WHERE valid_to IS NULL");

  pgm.createTable("product_media", {
    id: { type: "uuid", primaryKey: true },
    product_id: { type: "uuid", notNull: true, references: "products", onDelete: "CASCADE" },
    object_key: { type: "text", notNull: true, unique: true },
    content_type: { type: "text", notNull: true, check: "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')" },
    byte_size: { type: "integer", notNull: true, check: "byte_size > 0" },
    alt_text: { type: "text", notNull: true, check: "length(trim(alt_text)) > 0" },
    sort_order: { type: "integer", notNull: true, default: 0, check: "sort_order >= 0" },
    is_primary: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createIndex("product_media", "product_id");
  pgm.sql("CREATE UNIQUE INDEX product_media_one_primary_per_product ON product_media (product_id) WHERE is_primary = true");

  pgm.createTable("audit_events", {
    id: { type: "text", primaryKey: true },
    actor_type: { type: "text", notNull: true },
    actor_id: { type: "text", notNull: true },
    action: { type: "text", notNull: true },
    resource_type: { type: "text", notNull: true },
    resource_id: { type: "text", notNull: true },
    outcome: { type: "text", notNull: true, check: "outcome IN ('success', 'failure', 'denied', 'approval_required')" },
    correlation_id: { type: "text", notNull: true },
    metadata: { type: "jsonb", notNull: true, default: "{}" },
    occurred_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createIndex("audit_events", ["resource_type", "resource_id"]);
  pgm.createIndex("audit_events", "correlation_id");
  pgm.createIndex("audit_events", "occurred_at");
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("audit_events");
  pgm.dropTable("product_media");
  pgm.dropTable("product_prices");
  pgm.dropTable("product_variants");
  pgm.dropTable("products");
  pgm.dropTable("categories");
}
