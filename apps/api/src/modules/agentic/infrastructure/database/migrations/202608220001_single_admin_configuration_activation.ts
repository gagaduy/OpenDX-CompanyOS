// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_configuration_revisions
      DROP CONSTRAINT agentic_configuration_decision_check;
    ALTER TABLE agentic_configuration_revisions
      ADD CONSTRAINT agentic_configuration_decision_check CHECK (
        (state IN ('draft','pending_approval') AND decided_by IS NULL AND decided_at IS NULL)
        OR (state IN ('active','rejected','superseded') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
      );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM agentic_configuration_revisions
        WHERE state IN ('active','rejected','superseded') AND created_by=decided_by
      ) THEN
        RAISE EXCEPTION 'Cannot restore two-person configuration constraint while direct activations exist';
      END IF;
    END $$;
    ALTER TABLE agentic_configuration_revisions
      DROP CONSTRAINT agentic_configuration_decision_check;
    ALTER TABLE agentic_configuration_revisions
      ADD CONSTRAINT agentic_configuration_decision_check CHECK (
        (state IN ('draft','pending_approval') AND decided_by IS NULL AND decided_at IS NULL)
        OR (state IN ('active','rejected','superseded') AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decided_by <> created_by)
      );
  `);
}
