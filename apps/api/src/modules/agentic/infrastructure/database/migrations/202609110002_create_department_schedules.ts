// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_approval_requests
      DROP CONSTRAINT IF EXISTS agentic_approval_scope_check;
    ALTER TABLE agentic_approval_requests
      ADD CONSTRAINT agentic_approval_scope_check CHECK (
        approver_scope IN (
          'tool_invocation','emergency_revocation',
          'governance_configuration','workflow_execution',
          'schedule_activation'
        )
      );

    CREATE TABLE agentic_department_schedules (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('manual', 'automatic')),
      label TEXT NOT NULL,
      department_id TEXT NOT NULL CHECK (department_id IN ('marketing', 'merchandising', 'operations', 'support')),
      active_revision_id TEXT,
      activation_approval_id uuid REFERENCES agentic_approval_requests(id) ON DELETE SET NULL,
      state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'approval_pending', 'active', 'paused', 'canceled', 'superseded')),
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE agentic_department_schedule_revisions (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES agentic_department_schedules(id) ON DELETE CASCADE,
      revision INT NOT NULL CHECK (revision >= 1),
      department_id TEXT NOT NULL CHECK (department_id IN ('marketing', 'merchandising', 'operations', 'support')),
      task_template_digest TEXT NOT NULL,
      recurrence JSONB NOT NULL,
      timezone TEXT NOT NULL,
      configuration_revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id),
      risk_class TEXT NOT NULL CHECK (risk_class IN ('low', 'medium', 'high')),
      state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'approval_pending', 'active', 'paused', 'canceled', 'superseded')),
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (schedule_id, revision)
    );

    ALTER TABLE agentic_department_schedules
      ADD CONSTRAINT fk_agentic_department_schedules_active_revision
      FOREIGN KEY (active_revision_id)
      REFERENCES agentic_department_schedule_revisions(id)
      DEFERRABLE INITIALLY DEFERRED;

    CREATE TABLE agentic_department_schedule_occurrences (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES agentic_department_schedules(id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES agentic_department_schedule_revisions(id) ON DELETE RESTRICT,
      scheduled_for TIMESTAMPTZ NOT NULL,
      state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'dispatched', 'failed', 'canceled')),
      task_id uuid REFERENCES agentic_tasks(id) ON DELETE SET NULL,
      failure_reason TEXT,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (schedule_id, revision_id, scheduled_for)
    );

    CREATE TABLE agentic_department_schedule_commands (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES agentic_department_schedules(id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES agentic_department_schedule_revisions(id) ON DELETE RESTRICT,
      command_type TEXT NOT NULL CHECK (command_type IN ('start', 'pause', 'resume', 'cancel')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_agentic_dept_sched_department ON agentic_department_schedules(department_id, state);
    CREATE INDEX idx_agentic_dept_sched_rev_schedule ON agentic_department_schedule_revisions(schedule_id);
    CREATE INDEX idx_agentic_dept_sched_occ_sched ON agentic_department_schedule_occurrences(schedule_id, scheduled_for);
    CREATE INDEX idx_agentic_dept_sched_cmd_pending ON agentic_department_schedule_commands(delivered_at) WHERE delivered_at IS NULL;

    CREATE TRIGGER trg_agentic_department_schedules_command_center
      AFTER INSERT OR UPDATE ON agentic_department_schedules
      FOR EACH ROW EXECUTE FUNCTION notify_agentic_command_center_invalidation('schedule');

    CREATE TRIGGER trg_agentic_department_schedule_occurrences_command_center
      AFTER INSERT OR UPDATE ON agentic_department_schedule_occurrences
      FOR EACH ROW EXECUTE FUNCTION notify_agentic_command_center_invalidation('occurrence');
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_agentic_department_schedule_occurrences_command_center ON agentic_department_schedule_occurrences;
    DROP TRIGGER IF EXISTS trg_agentic_department_schedules_command_center ON agentic_department_schedules;

    DROP TABLE IF EXISTS agentic_department_schedule_commands;
    DROP TABLE IF EXISTS agentic_department_schedule_occurrences;
    ALTER TABLE agentic_department_schedules DROP CONSTRAINT IF EXISTS fk_agentic_department_schedules_active_revision;
    DROP TABLE IF EXISTS agentic_department_schedule_revisions;
    DROP TABLE IF EXISTS agentic_department_schedules;

    ALTER TABLE agentic_approval_requests
      DROP CONSTRAINT IF EXISTS agentic_approval_scope_check;
    ALTER TABLE agentic_approval_requests
      ADD CONSTRAINT agentic_approval_scope_check CHECK (
        approver_scope IN (
          'tool_invocation','emergency_revocation',
          'governance_configuration','workflow_execution'
        )
      );
  `);
}
