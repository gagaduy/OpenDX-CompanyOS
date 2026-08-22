// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_orchestration_execution_descriptors (
      id uuid PRIMARY KEY,
      version integer NOT NULL CHECK(version > 0),
      task_id uuid NOT NULL,
      plan_version integer NOT NULL CHECK(plan_version > 0),
      subtask_id uuid NOT NULL REFERENCES agentic_orchestration_plan_subtasks(id) ON DELETE RESTRICT,
      agent_kind text NOT NULL REFERENCES agentic_agents(kind) CHECK(agent_kind <> 'ai_ceo'),
      configuration_revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id) ON DELETE RESTRICT,
      policy_version integer NOT NULL CHECK(policy_version > 0),
      primary_model text NOT NULL CHECK(length(btrim(primary_model)) BETWEEN 1 AND 255),
      fallback_model text NOT NULL CHECK(length(btrim(fallback_model)) BETWEEN 1 AND 255),
      result_schema_name text NOT NULL CHECK(result_schema_name ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$'),
      result_schema_digest text NOT NULL CHECK(result_schema_digest ~ '^[a-f0-9]{64}$'),
      authorized_context_digest text NOT NULL CHECK(authorized_context_digest ~ '^[a-f0-9]{64}$'),
      allowed_tools_digest text NOT NULL CHECK(allowed_tools_digest ~ '^[a-f0-9]{64}$'),
      budget_authorization_micros bigint NOT NULL CHECK(budget_authorization_micros > 0),
      timeout_seconds integer NOT NULL CHECK(timeout_seconds > 0),
      freshness_seconds integer NOT NULL CHECK(freshness_seconds > 0),
      expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
      payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      descriptor_digest text NOT NULL UNIQUE CHECK(descriptor_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
      CHECK(expires_at > created_at),
      UNIQUE(id, payload_digest),
      UNIQUE(task_id, plan_version, subtask_id, version),
      FOREIGN KEY(task_id, plan_version)
        REFERENCES agentic_orchestration_plan_revisions(task_id, version) ON DELETE RESTRICT
    );

    CREATE TABLE agentic_orchestration_execution_payloads (
      descriptor_id uuid PRIMARY KEY,
      payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
      payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      CHECK(octet_length(payload::text) <= 262144),
      FOREIGN KEY(descriptor_id, payload_digest)
        REFERENCES agentic_orchestration_execution_descriptors(id, payload_digest) ON DELETE RESTRICT
    );

    CREATE FUNCTION agentic_validate_execution_descriptor_binding()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM agentic_orchestration_plan_subtasks subtask
        JOIN agentic_orchestration_plan_revisions plan ON plan.id=subtask.plan_id
        WHERE subtask.id=NEW.subtask_id
          AND plan.task_id=NEW.task_id
          AND plan.version=NEW.plan_version
          AND plan.configuration_revision_id=NEW.configuration_revision_id
          AND plan.policy_version=NEW.policy_version
          AND subtask.agent_kind=NEW.agent_kind
          AND subtask.expected_result_schema_digest=NEW.result_schema_digest
          AND subtask.allowed_tools_digest=NEW.allowed_tools_digest
          AND subtask.timeout_seconds=NEW.timeout_seconds
          AND subtask.freshness_seconds=NEW.freshness_seconds
          AND subtask.budget_micros=NEW.budget_authorization_micros
      ) THEN
        RAISE EXCEPTION 'execution descriptor authority does not match its plan subtask'
          USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER agentic_orchestration_execution_descriptors_binding
      BEFORE INSERT ON agentic_orchestration_execution_descriptors
      FOR EACH ROW EXECUTE FUNCTION agentic_validate_execution_descriptor_binding();
    CREATE TRIGGER agentic_orchestration_execution_descriptors_immutable
      BEFORE UPDATE OR DELETE ON agentic_orchestration_execution_descriptors
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_orchestration_execution_payloads_immutable
      BEFORE UPDATE OR DELETE ON agentic_orchestration_execution_payloads
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS agentic_orchestration_execution_payloads;
    DROP TABLE IF EXISTS agentic_orchestration_execution_descriptors;
    DROP FUNCTION IF EXISTS agentic_validate_execution_descriptor_binding();
  `);
}
