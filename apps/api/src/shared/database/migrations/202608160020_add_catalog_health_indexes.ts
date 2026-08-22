// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE INDEX products_health_status_updated_idx
      ON products(status,updated_at,id) WHERE status<>'archived';
    CREATE INDEX product_variants_health_product_status_idx
      ON product_variants(product_id,status,id);
    CREATE INDEX product_prices_health_variant_window_idx
      ON product_prices(variant_id,valid_from,valid_to,id);
    CREATE INDEX product_media_health_product_primary_idx
      ON product_media(product_id,is_primary,id);
    CREATE INDEX categories_health_status_idx ON categories(status,id);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP INDEX IF EXISTS categories_health_status_idx;
    DROP INDEX IF EXISTS product_media_health_product_primary_idx;
    DROP INDEX IF EXISTS product_prices_health_variant_window_idx;
    DROP INDEX IF EXISTS product_variants_health_product_status_idx;
    DROP INDEX IF EXISTS products_health_status_updated_idx;
  `);
}
