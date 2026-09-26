// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_command_center_events (
      sequence BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'snapshot_invalidated' CHECK (kind IN ('snapshot_invalidated')),
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_agentic_command_center_events_seq ON agentic_command_center_events (sequence ASC);
    CREATE INDEX idx_agentic_command_center_events_occurred_at ON agentic_command_center_events (occurred_at ASC);

    CREATE OR REPLACE FUNCTION notify_agentic_command_center_invalidation()
    RETURNS TRIGGER AS $$
    DECLARE
      res_id TEXT;
    BEGIN
      IF TG_TABLE_NAME = 'agentic_orchestration_plan_dependencies' THEN
        res_id := COALESCE(NEW.plan_id::text, OLD.plan_id::text) || ':' || COALESCE(NEW.subtask_id::text, OLD.subtask_id::text);
      ELSE
        res_id := COALESCE(NEW.id::text, OLD.id::text, 'unknown');
      END IF;

      INSERT INTO agentic_command_center_events (kind, resource_type, resource_id, occurred_at)
      VALUES ('snapshot_invalidated', TG_ARGV[0], res_id, CURRENT_TIMESTAMP);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_agentic_tasks_command_center
      AFTER INSERT OR UPDATE ON agentic_tasks
      FOR EACH ROW EXECUTE FUNCTION notify_agentic_command_center_invalidation('task');

    CREATE TRIGGER trg_agentic_workflow_runs_command_center
      AFTER INSERT OR UPDATE ON agentic_workflow_runs
      FOR EACH ROW EXECUTE FUNCTION notify_agentic_command_center_invalidation('workflow_run');

    CREATE TRIGGER trg_agentic_orchestration_plan_subtasks_command_center
      AFTER INSERT OR UPDATE ON agentic_orchestration_plan_subtasks
      FOR EACH ROW EXECUTE FUNCTION notify_agentic_command_center_invalidation('subtask');

    CREATE TRIGGER trg_agentic_orchestration_plan_dependencies_command_center
      AFTER INSERT OR UPDATE OR DELETE ON agentic_orchestration_plan_dependencies
      FOR EACH ROW EXECUTE FUNCTION notify_agentic_command_center_invalidation('dependency');

    CREATE TRIGGER trg_agentic_approval_requests_command_center
      AFTER INSERT OR UPDATE ON agentic_approval_requests
      FOR EACH ROW EXECUTE FUNCTION notify_agentic_command_center_invalidation('approval');
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_agentic_approval_requests_command_center ON agentic_approval_requests;
    DROP TRIGGER IF EXISTS trg_agentic_orchestration_plan_dependencies_command_center ON agentic_orchestration_plan_dependencies;
    DROP TRIGGER IF EXISTS trg_agentic_orchestration_plan_subtasks_command_center ON agentic_orchestration_plan_subtasks;
    DROP TRIGGER IF EXISTS trg_agentic_workflow_runs_command_center ON agentic_workflow_runs;
    DROP TRIGGER IF EXISTS trg_agentic_tasks_command_center ON agentic_tasks;
    DROP FUNCTION IF EXISTS notify_agentic_command_center_invalidation();
    DROP TABLE IF EXISTS agentic_command_center_events;
  `);
}
