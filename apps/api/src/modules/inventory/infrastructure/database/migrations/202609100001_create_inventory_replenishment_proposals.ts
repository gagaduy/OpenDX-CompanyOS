// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("inventory_replenishment_proposals", {
    id: { type: "uuid", primaryKey: true },
    trigger_source: { type: "varchar(32)", notNull: true },
    status: { type: "varchar(32)", notNull: true, default: "pending_review" },
    summary: { type: "text", notNull: true },
    risk_assessment: { type: "text" },
    items: { type: "jsonb", notNull: true },
    total_budget_vnd: { type: "bigint", notNull: true, default: 0 },
    docx_report_key: { type: "varchar(255)" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    reviewed_at: { type: "timestamptz" },
    reviewed_by: { type: "varchar(128)" },
  });

  pgm.createIndex("inventory_replenishment_proposals", ["status", "created_at"], {
    name: "idx_replenishment_pending_status",
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex("inventory_replenishment_proposals", ["status", "created_at"], {
    name: "idx_replenishment_pending_status",
  });
  pgm.dropTable("inventory_replenishment_proposals");
}
