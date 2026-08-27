// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE storefront_service_assurances (
      code TEXT PRIMARY KEY CHECK (btrim(code) <> ''),
      icon_key TEXT NOT NULL
        CHECK (icon_key IN ('truck', 'shield-check', 'badge-percent', 'headphones')),
      title TEXT NOT NULL CHECK (btrim(title) <> ''),
      description TEXT NOT NULL CHECK (btrim(description) <> ''),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX storefront_service_assurances_enabled_order_idx
      ON storefront_service_assurances(sort_order, code)
      WHERE enabled = TRUE;

    CREATE TABLE storefront_trust_metrics (
      code TEXT PRIMARY KEY CHECK (btrim(code) <> ''),
      display_value TEXT NOT NULL CHECK (btrim(display_value) <> ''),
      label TEXT NOT NULL CHECK (btrim(label) <> ''),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX storefront_trust_metrics_enabled_order_idx
      ON storefront_trust_metrics(sort_order, code)
      WHERE enabled = TRUE;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS storefront_trust_metrics;
    DROP TABLE IF EXISTS storefront_service_assurances;
  `);
}
