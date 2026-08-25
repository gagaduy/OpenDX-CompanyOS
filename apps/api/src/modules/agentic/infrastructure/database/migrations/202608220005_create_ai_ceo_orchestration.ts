// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_orchestration_plan_revisions (
      id uuid PRIMARY KEY,
      task_id uuid NOT NULL REFERENCES agentic_tasks(id) ON DELETE RESTRICT,
      version integer NOT NULL CHECK(version > 0),
      plan_digest text NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
      task_brief_digest text NOT NULL CHECK(task_brief_digest ~ '^[a-f0-9]{64}$'),
      policy_version integer NOT NULL CHECK(policy_version > 0),
      configuration_revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id) ON DELETE RESTRICT,
      created_by text NOT NULL CHECK(length(btrim(created_by)) BETWEEN 1 AND 255),
      created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
      UNIQUE(task_id, version),
      UNIQUE(task_id, plan_digest)
    );
    CREATE TABLE agentic_orchestration_plan_subtasks (
      id uuid PRIMARY KEY,
      plan_id uuid NOT NULL REFERENCES agentic_orchestration_plan_revisions(id) ON DELETE RESTRICT,
      agent_kind text NOT NULL REFERENCES agentic_agents(kind),
      expected_result_schema_digest text NOT NULL CHECK(expected_result_schema_digest ~ '^[a-f0-9]{64}$'),
      allowed_tools_digest text NOT NULL CHECK(allowed_tools_digest ~ '^[a-f0-9]{64}$'),
      data_scope text NOT NULL CHECK(length(btrim(data_scope)) BETWEEN 1 AND 255),
      freshness_seconds integer NOT NULL CHECK(freshness_seconds > 0),
      timeout_seconds integer NOT NULL CHECK(timeout_seconds > 0),
      budget_micros bigint NOT NULL CHECK(budget_micros > 0),
      source_provenance_digest text NOT NULL CHECK(source_provenance_digest ~ '^[a-f0-9]{64}$'),
      UNIQUE(plan_id, id)
    );
    CREATE TABLE agentic_orchestration_plan_dependencies (
      plan_id uuid NOT NULL REFERENCES agentic_orchestration_plan_revisions(id) ON DELETE RESTRICT,
      subtask_id uuid NOT NULL,
      dependency_subtask_id uuid NOT NULL,
      PRIMARY KEY(plan_id, subtask_id, dependency_subtask_id),
      CHECK(subtask_id <> dependency_subtask_id),
      FOREIGN KEY(plan_id, subtask_id) REFERENCES agentic_orchestration_plan_subtasks(plan_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(plan_id, dependency_subtask_id) REFERENCES agentic_orchestration_plan_subtasks(plan_id, id) ON DELETE RESTRICT
    );
    CREATE TABLE agentic_collaboration_requests (
      id uuid PRIMARY KEY,
      task_id uuid NOT NULL,
      plan_version integer NOT NULL CHECK(plan_version > 0),
      requester_agent_kind text NOT NULL REFERENCES agentic_agents(kind),
      requested_agent_kind text NOT NULL REFERENCES agentic_agents(kind),
      question_digest text NOT NULL CHECK(question_digest ~ '^[a-f0-9]{64}$'),
      purpose text NOT NULL CHECK(length(btrim(purpose)) BETWEEN 1 AND 500),
      requested_data_classification text NOT NULL CHECK(length(btrim(requested_data_classification)) BETWEEN 1 AND 64),
      evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[a-f0-9]{64}$'),
      redacted_payload_digest text NOT NULL CHECK(redacted_payload_digest ~ '^[a-f0-9]{64}$'),
      policy_version integer NOT NULL CHECK(policy_version > 0),
      policy_decision text NOT NULL CHECK(policy_decision IN ('ALLOW','REQUIRE_APPROVAL','DENY')),
      idempotency_key text NOT NULL UNIQUE CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$'),
      created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
      CHECK(requester_agent_kind <> requested_agent_kind),
      FOREIGN KEY(task_id, plan_version) REFERENCES agentic_orchestration_plan_revisions(task_id, version) ON DELETE RESTRICT
    );
    CREATE TABLE agentic_accepted_orchestration_results (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, plan_version integer NOT NULL,
      subtask_id uuid NOT NULL REFERENCES agentic_orchestration_plan_subtasks(id) ON DELETE RESTRICT,
      result_digest text NOT NULL CHECK(result_digest~'^[a-f0-9]{64}$'),
      quality_evidence_digest text NOT NULL CHECK(quality_evidence_digest~'^[a-f0-9]{64}$'),
      provenance_digest text NOT NULL CHECK(provenance_digest~'^[a-f0-9]{64}$'),
      accepted_at timestamptz NOT NULL CHECK(isfinite(accepted_at)),
      UNIQUE(subtask_id,quality_evidence_digest),
      FOREIGN KEY(task_id,plan_version) REFERENCES agentic_orchestration_plan_revisions(task_id,version) ON DELETE RESTRICT
    );
    CREATE TABLE agentic_executive_reports (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, plan_version integer NOT NULL,
      report_digest text NOT NULL CHECK(report_digest~'^[a-f0-9]{64}$'),
      completion_state text NOT NULL CHECK(completion_state IN ('complete','partial','quality_escalated','canceled')),
      conclusion_provenance_digest text NOT NULL CHECK(conclusion_provenance_digest~'^[a-f0-9]{64}$'),
      unavailable_branches_digest text NOT NULL CHECK(unavailable_branches_digest~'^[a-f0-9]{64}$'),
      cost_micros bigint NOT NULL CHECK(cost_micros>=0),
      approval_history_digest text NOT NULL CHECK(approval_history_digest~'^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
      UNIQUE(task_id,plan_version),
      FOREIGN KEY(task_id,plan_version) REFERENCES agentic_orchestration_plan_revisions(task_id,version) ON DELETE RESTRICT
    );
    CREATE TRIGGER agentic_orchestration_plan_revisions_immutable
      BEFORE UPDATE OR DELETE ON agentic_orchestration_plan_revisions
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_orchestration_plan_subtasks_immutable
      BEFORE UPDATE OR DELETE ON agentic_orchestration_plan_subtasks
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_orchestration_plan_dependencies_immutable
      BEFORE UPDATE OR DELETE ON agentic_orchestration_plan_dependencies
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_collaboration_requests_immutable
      BEFORE UPDATE OR DELETE ON agentic_collaboration_requests
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_accepted_orchestration_results_immutable
      BEFORE UPDATE OR DELETE ON agentic_accepted_orchestration_results
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_executive_reports_immutable
      BEFORE UPDATE OR DELETE ON agentic_executive_reports
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS agentic_executive_reports;
    DROP TABLE IF EXISTS agentic_accepted_orchestration_results;
    DROP TABLE IF EXISTS agentic_collaboration_requests;
    DROP TABLE IF EXISTS agentic_orchestration_plan_dependencies;
    DROP TABLE IF EXISTS agentic_orchestration_plan_subtasks;
    DROP TABLE IF EXISTS agentic_orchestration_plan_revisions;
  `);
}
