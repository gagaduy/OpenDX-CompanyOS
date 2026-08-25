// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE INDEX support_tickets_health_window_idx
      ON support_tickets (created_at,id)
      INCLUDE (priority,status,assignee_id,sla_paused_seconds,sla_stopped_seconds,
        sla_pause_started_at)
      WHERE status NOT IN ('resolved','closed');
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("DROP INDEX support_tickets_health_window_idx");
}
