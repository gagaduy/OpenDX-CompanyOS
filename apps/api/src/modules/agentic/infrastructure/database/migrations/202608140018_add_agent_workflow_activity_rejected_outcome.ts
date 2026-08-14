// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  replaceOutcomeConstraints(pgm, true);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE agentic_workflow_runs
    SET outcome_code='RETRY_EXHAUSTED'
    WHERE outcome_code='ACTIVITY_REJECTED';
  `);
  replaceOutcomeConstraints(pgm, false);
}

function replaceOutcomeConstraints(
  pgm: MigrationBuilder,
  includeActivityRejected: boolean,
): void {
  const activityOutcome = includeActivityRejected ? ",'ACTIVITY_REJECTED'" : "";
  pgm.sql(`
    DO $migration$
    DECLARE outcome_constraint text;
    BEGIN
      FOR outcome_constraint IN
        SELECT constraint_record.conname
        FROM pg_constraint constraint_record
        JOIN pg_attribute column_record
          ON column_record.attrelid=constraint_record.conrelid
          AND column_record.attnum=ANY(constraint_record.conkey)
        WHERE constraint_record.conrelid='agentic_workflow_runs'::regclass
          AND constraint_record.contype='c'
          AND column_record.attname='outcome_code'
      LOOP
        EXECUTE format(
          'ALTER TABLE agentic_workflow_runs DROP CONSTRAINT %I',
          outcome_constraint
        );
      END LOOP;
    END
    $migration$;

    ALTER TABLE agentic_workflow_runs
      ADD CONSTRAINT agentic_workflow_outcome_code_check CHECK (
        outcome_code IS NULL OR outcome_code IN (
          'COMPLETED','PARTIAL_ACTIVITY_FAILURE','APPROVAL_REJECTED',
          'APPROVAL_EXPIRED','CANCELED_BY_STAFF','RETRY_EXHAUSTED',
          'INVALID_FROZEN_PLAN'${activityOutcome}
        )
      ),
      ADD CONSTRAINT agentic_workflow_terminal_outcome_check CHECK (
        (state='completed' AND outcome_code='COMPLETED' AND completed_at IS NOT NULL)
        OR (state='partially_completed' AND outcome_code='PARTIAL_ACTIVITY_FAILURE' AND completed_at IS NOT NULL)
        OR (state='canceled' AND outcome_code='CANCELED_BY_STAFF' AND completed_at IS NOT NULL)
        OR (state='failed' AND outcome_code IN (
          'APPROVAL_REJECTED','APPROVAL_EXPIRED','RETRY_EXHAUSTED',
          'INVALID_FROZEN_PLAN'${activityOutcome}
        ) AND completed_at IS NOT NULL)
        OR (state NOT IN ('completed','partially_completed','canceled','failed')
          AND outcome_code IS NULL AND completed_at IS NULL)
      );
  `);
}
