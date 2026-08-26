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
    WHERE outcome_code='LIVE_EXECUTION_UNAVAILABLE';
  `);
  replaceOutcomeConstraints(pgm, false);
}

function replaceOutcomeConstraints(
  pgm: MigrationBuilder, includeLiveExecutionUnavailable: boolean,
): void {
  const liveOutcome = includeLiveExecutionUnavailable
    ? ",'LIVE_EXECUTION_UNAVAILABLE'" : "";
  pgm.sql(`
    ALTER TABLE agentic_workflow_runs
      DROP CONSTRAINT agentic_workflow_outcome_code_check,
      DROP CONSTRAINT agentic_workflow_terminal_outcome_check;
    ALTER TABLE agentic_workflow_runs
      ADD CONSTRAINT agentic_workflow_outcome_code_check CHECK (
        outcome_code IS NULL OR outcome_code IN (
          'COMPLETED','PARTIAL_ACTIVITY_FAILURE','APPROVAL_REJECTED',
          'APPROVAL_EXPIRED','CANCELED_BY_STAFF','RETRY_EXHAUSTED',
          'ACTIVITY_REJECTED','INVALID_FROZEN_PLAN'${liveOutcome}
        )
      ),
      ADD CONSTRAINT agentic_workflow_terminal_outcome_check CHECK (
        (state='completed' AND outcome_code='COMPLETED' AND completed_at IS NOT NULL)
        OR (state='partially_completed' AND outcome_code='PARTIAL_ACTIVITY_FAILURE' AND completed_at IS NOT NULL)
        OR (state='canceled' AND outcome_code='CANCELED_BY_STAFF' AND completed_at IS NOT NULL)
        OR (state='failed' AND outcome_code IN (
          'APPROVAL_REJECTED','APPROVAL_EXPIRED','RETRY_EXHAUSTED',
          'ACTIVITY_REJECTED','INVALID_FROZEN_PLAN'${liveOutcome}
        ) AND completed_at IS NOT NULL)
        OR (state NOT IN ('completed','partially_completed','canceled','failed')
          AND outcome_code IS NULL AND completed_at IS NULL)
      );
  `);
}
