// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE INDEX orders_stalled_health_idx
      ON orders (updated_at,id) INCLUDE (created_at,total_vnd,status)
      WHERE status IN ('paid','processing','ready_for_fulfillment');
    CREATE INDEX orders_pending_expiry_health_idx
      ON orders (reservation_expires_at,id) INCLUDE (total_vnd)
      WHERE status='pending_payment';
    CREATE INDEX orders_paid_at_health_idx
      ON orders (paid_at,id) INCLUDE (status,customer_id,total_vnd)
      WHERE paid_at IS NOT NULL;
    CREATE INDEX order_status_history_detected_health_idx
      ON order_status_history (occurred_at,order_id,id)
      INCLUDE (previous_status,new_status);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP INDEX order_status_history_detected_health_idx;
    DROP INDEX orders_paid_at_health_idx;
    DROP INDEX orders_pending_expiry_health_idx;
    DROP INDEX orders_stalled_health_idx;
  `);
}
