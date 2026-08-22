// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_audit_events
      ADD COLUMN client_id text,
      ADD COLUMN parameters_digest text
        CHECK(parameters_digest IS NULL OR parameters_digest~'^[a-f0-9]{64}$'),
      ADD COLUMN attempt integer CHECK(attempt IS NULL OR attempt>=0),
      ADD COLUMN duration_ms integer CHECK(duration_ms IS NULL OR duration_ms>=0),
      ADD COLUMN result_digest text
        CHECK(result_digest IS NULL OR result_digest~'^[a-f0-9]{64}$'),
      ADD COLUMN error_code text
        CHECK(error_code IS NULL OR error_code~'^[A-Z][A-Z0-9_]{0,63}$');

    ALTER TABLE agentic_provenance_records
      ADD COLUMN source_version integer CHECK(source_version IS NULL OR source_version>0),
      ADD COLUMN normalized_window jsonb,
      ADD COLUMN source_snapshot_at timestamptz;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_provenance_records
      DROP COLUMN source_snapshot_at,
      DROP COLUMN normalized_window,
      DROP COLUMN source_version;

    ALTER TABLE agentic_audit_events
      DROP COLUMN error_code,
      DROP COLUMN result_digest,
      DROP COLUMN duration_ms,
      DROP COLUMN attempt,
      DROP COLUMN parameters_digest,
      DROP COLUMN client_id;
  `);
}
