// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_tasks
      ADD COLUMN execution_profile text NOT NULL DEFAULT 'store_health_review'
      CHECK (execution_profile IN ('store_health_review','advanced_live'));
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("ALTER TABLE agentic_tasks DROP COLUMN execution_profile;");
}
