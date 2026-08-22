// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn("agentic_audit_events", {
    attempted_task_id: { type: "uuid" },
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn("agentic_audit_events", "attempted_task_id");
}
