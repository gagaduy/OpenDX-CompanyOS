// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("customer_wishlist_items", {
    customer_id: {
      type: "uuid",
      notNull: true,
      references: "customers",
      onDelete: "CASCADE",
    },
    product_id: {
      type: "uuid",
      notNull: true,
      references: "products",
      onDelete: "CASCADE",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint(
    "customer_wishlist_items",
    "customer_wishlist_items_pkey",
    { primaryKey: ["customer_id", "product_id"] },
  );
  pgm.sql(
    `CREATE INDEX customer_wishlist_items_customer_order
     ON customer_wishlist_items (customer_id, created_at DESC, product_id ASC)`,
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("customer_wishlist_items");
}
