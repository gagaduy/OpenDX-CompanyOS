// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_workflow_runs (
      id uuid PRIMARY KEY,
      task_id uuid NOT NULL REFERENCES agentic_tasks(id) ON DELETE RESTRICT,
      workflow_name text NOT NULL CHECK(workflow_name='StoreHealthReviewWorkflowV1'),
      workflow_version integer NOT NULL CHECK(workflow_version=1),
      plan_revision integer NOT NULL CHECK(plan_revision>0),
      temporal_workflow_id text NOT NULL UNIQUE
        CHECK(length(btrim(temporal_workflow_id)) BETWEEN 1 AND 255),
      temporal_run_id text UNIQUE
        CHECK(temporal_run_id IS NULL OR length(btrim(temporal_run_id)) BETWEEN 1 AND 255),
      state text NOT NULL CHECK(state IN (
        'received','planning','awaiting_plan_approval','dispatching',
        'department_analysis','quality_review','collaboration',
        'executive_synthesis','awaiting_human_approval','retrying',
        'partially_completed','failed','canceled','completed'
      )),
      projection_sequence integer NOT NULL DEFAULT 0 CHECK(projection_sequence>=0),
      resume_state text CHECK(resume_state IS NULL OR resume_state IN (
        'department_analysis','quality_review','collaboration','executive_synthesis'
      )),
      outcome_code text CHECK(outcome_code IS NULL OR outcome_code IN (
        'COMPLETED','PARTIAL_ACTIVITY_FAILURE','APPROVAL_REJECTED',
        'APPROVAL_EXPIRED','CANCELED_BY_STAFF','RETRY_EXHAUSTED',
        'INVALID_FROZEN_PLAN'
      )),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      UNIQUE(task_id,workflow_name,workflow_version,plan_revision),
      CHECK(updated_at>=created_at),
      CHECK(
        (state='retrying' AND resume_state IS NOT NULL)
        OR (state<>'retrying' AND resume_state IS NULL)
      ),
      CHECK(
        (state='completed' AND outcome_code='COMPLETED' AND completed_at IS NOT NULL)
        OR (state='partially_completed' AND outcome_code='PARTIAL_ACTIVITY_FAILURE' AND completed_at IS NOT NULL)
        OR (state='canceled' AND outcome_code='CANCELED_BY_STAFF' AND completed_at IS NOT NULL)
        OR (state='failed' AND outcome_code IN (
          'APPROVAL_REJECTED','APPROVAL_EXPIRED','RETRY_EXHAUSTED','INVALID_FROZEN_PLAN'
        ) AND completed_at IS NOT NULL)
        OR (state NOT IN ('completed','partially_completed','canceled','failed')
          AND outcome_code IS NULL AND completed_at IS NULL)
      )
    );
    CREATE UNIQUE INDEX agentic_workflow_one_nonterminal_per_task_idx
      ON agentic_workflow_runs(task_id)
      WHERE state NOT IN ('completed','partially_completed','failed','canceled');
    CREATE INDEX agentic_workflow_runs_state_idx
      ON agentic_workflow_runs(state,updated_at,id);

    CREATE TABLE agentic_activity_invocations (
      invocation_key text PRIMARY KEY CHECK(length(btrim(invocation_key)) BETWEEN 1 AND 1000),
      workflow_run_id uuid NOT NULL REFERENCES agentic_workflow_runs(id) ON DELETE RESTRICT,
      activity_kind text NOT NULL CHECK(activity_kind IN (
        'load_frozen_plan','project_state','execute_fake_analysis',
        'execute_fake_quality_review','execute_fake_collaboration',
        'execute_fake_synthesis'
      )),
      branch_id uuid REFERENCES agentic_subtasks(id) ON DELETE RESTRICT,
      input_digest text NOT NULL CHECK(input_digest~'^[a-f0-9]{64}$'),
      state text NOT NULL CHECK(state IN ('reserved','completed','failed')),
      outcome_code text CHECK(
        outcome_code IS NULL OR length(btrim(outcome_code)) BETWEEN 1 AND 100
      ),
      safe_result jsonb CHECK(
        safe_result IS NULL OR (
          jsonb_typeof(safe_result)='object'
          AND octet_length(safe_result::text)<=16384
        )
      ),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      CHECK(updated_at>=created_at),
      CHECK(
        (state='reserved' AND outcome_code IS NULL AND safe_result IS NULL AND completed_at IS NULL)
        OR (state='completed' AND outcome_code IS NOT NULL AND safe_result IS NOT NULL AND completed_at IS NOT NULL)
        OR (state='failed' AND outcome_code IS NOT NULL AND safe_result IS NULL AND completed_at IS NOT NULL)
      )
    );
    CREATE INDEX agentic_activity_run_state_idx
      ON agentic_activity_invocations(workflow_run_id,state,updated_at,invocation_key);

    CREATE TABLE agentic_workflow_signal_receipts (
      id uuid PRIMARY KEY,
      workflow_run_id uuid NOT NULL REFERENCES agentic_workflow_runs(id) ON DELETE RESTRICT,
      signal_kind text NOT NULL CHECK(signal_kind IN ('approval','cancellation')),
      idempotency_key text NOT NULL UNIQUE
        CHECK(length(btrim(idempotency_key)) BETWEEN 1 AND 255),
      approval_id uuid REFERENCES agentic_approval_requests(id) ON DELETE RESTRICT,
      payload_digest text NOT NULL CHECK(payload_digest~'^[a-f0-9]{64}$'),
      decision text CHECK(decision IS NULL OR decision IN ('approved','rejected')),
      application_decision_version integer CHECK(
        application_decision_version IS NULL OR application_decision_version>0
      ),
      delivery_state text NOT NULL CHECK(delivery_state IN ('pending','delivered','rejected')),
      accepted boolean,
      reason_code text CHECK(
        reason_code IS NULL OR length(btrim(reason_code)) BETWEEN 1 AND 100
      ),
      created_at timestamptz NOT NULL DEFAULT now(),
      delivered_at timestamptz,
      CHECK(
        (signal_kind='approval' AND approval_id IS NOT NULL
          AND decision IS NOT NULL AND application_decision_version IS NOT NULL)
        OR (signal_kind='cancellation' AND approval_id IS NULL
          AND decision IS NULL AND application_decision_version IS NULL)
      ),
      CHECK(
        (delivery_state='pending' AND accepted IS NULL
          AND reason_code IS NULL AND delivered_at IS NULL)
        OR (delivery_state='delivered' AND accepted IS NOT NULL
          AND delivered_at IS NOT NULL
          AND (accepted OR reason_code IS NOT NULL))
        OR (delivery_state='rejected' AND accepted=false
          AND reason_code IS NOT NULL AND delivered_at IS NOT NULL)
      )
    );
    CREATE INDEX agentic_workflow_signal_pending_idx
      ON agentic_workflow_signal_receipts(created_at,id)
      WHERE delivery_state='pending';
    CREATE INDEX agentic_workflow_signal_run_idx
      ON agentic_workflow_signal_receipts(workflow_run_id,created_at,id);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS agentic_workflow_signal_receipts;
    DROP TABLE IF EXISTS agentic_activity_invocations;
    DROP TABLE IF EXISTS agentic_workflow_runs;
  `);
}
