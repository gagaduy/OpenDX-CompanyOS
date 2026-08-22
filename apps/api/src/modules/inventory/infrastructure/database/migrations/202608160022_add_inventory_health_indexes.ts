// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE INDEX inventory_items_available_health_idx
      ON inventory_items ((on_hand-reserved),variant_id)
      WHERE on_hand-reserved>0;
    CREATE INDEX inventory_reservations_finalization_anomaly_idx
      ON inventory_reservations (updated_at,id)
      INCLUDE (variant_id,quantity,status,expires_at,finalized_at)
      WHERE (status<>'active' AND finalized_at IS NULL)
         OR (status='active' AND finalized_at IS NOT NULL);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP INDEX inventory_reservations_finalization_anomaly_idx;
    DROP INDEX inventory_items_available_health_idx;
  `);
}
