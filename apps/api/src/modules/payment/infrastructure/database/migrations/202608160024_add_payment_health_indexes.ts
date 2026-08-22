// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE INDEX payments_pending_health_idx
      ON payments (created_at,id) INCLUDE (status,expected_amount_vnd)
      WHERE status IN ('created','pending_provider');
    CREATE INDEX payment_reconciliations_health_idx
      ON payment_reconciliations (created_at,id)
      INCLUDE (payment_id,comparison_result,internal_status,provider_status,
        internal_amount_vnd,provider_amount_vnd)
      WHERE comparison_result IN ('mismatch','provider_error','unsupported');
    CREATE INDEX payment_events_health_idx
      ON payment_events (received_at,id)
      INCLUDE (payment_id,authentication_result,processing_result,normalized_state);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP INDEX payment_events_health_idx;
    DROP INDEX payment_reconciliations_health_idx;
    DROP INDEX payments_pending_health_idx;
  `);
}
