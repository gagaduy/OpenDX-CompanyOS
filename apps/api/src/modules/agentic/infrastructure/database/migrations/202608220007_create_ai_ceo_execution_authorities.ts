// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_accepted_orchestration_results
      ADD CONSTRAINT agentic_accepted_orchestration_results_id_digest_unique
      UNIQUE(id,result_digest);
    ALTER TABLE agentic_executive_reports
      ADD CONSTRAINT agentic_executive_reports_id_digest_unique
      UNIQUE(id,report_digest);

    CREATE TABLE agentic_ai_ceo_execution_authorities (
      id uuid PRIMARY KEY,
      version integer NOT NULL CHECK(version > 0),
      purpose text NOT NULL CHECK(purpose IN ('orchestration_planning','executive_synthesis')),
      task_id uuid NOT NULL REFERENCES agentic_tasks(id) ON DELETE RESTRICT,
      plan_version integer,
      configuration_revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id) ON DELETE RESTRICT,
      policy_version integer NOT NULL CHECK(policy_version > 0),
      primary_model text NOT NULL CHECK(length(btrim(primary_model)) BETWEEN 1 AND 255),
      fallback_model text NOT NULL CHECK(length(btrim(fallback_model)) BETWEEN 1 AND 255),
      result_schema_name text NOT NULL CHECK(result_schema_name ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$'),
      result_schema_digest text NOT NULL CHECK(result_schema_digest ~ '^[a-f0-9]{64}$'),
      authorized_context_digest text NOT NULL CHECK(authorized_context_digest ~ '^[a-f0-9]{64}$'),
      budget_authorization_micros bigint NOT NULL CHECK(budget_authorization_micros > 0),
      timeout_seconds integer NOT NULL CHECK(timeout_seconds > 0),
      expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
      payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      authority_digest text NOT NULL UNIQUE CHECK(authority_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
      CHECK(expires_at > created_at),
      CHECK((purpose='orchestration_planning' AND plan_version IS NULL)
        OR (purpose='executive_synthesis' AND plan_version > 0)),
      UNIQUE(id,payload_digest),
      UNIQUE NULLS NOT DISTINCT(task_id,purpose,plan_version,version),
      FOREIGN KEY(task_id,plan_version)
        REFERENCES agentic_orchestration_plan_revisions(task_id,version) ON DELETE RESTRICT
    );

    CREATE TABLE agentic_ai_ceo_execution_payloads (
      authority_id uuid PRIMARY KEY,
      payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
      payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      CHECK(octet_length(payload::text) <= 262144),
      FOREIGN KEY(authority_id,payload_digest)
        REFERENCES agentic_ai_ceo_execution_authorities(id,payload_digest) ON DELETE RESTRICT
    );

    CREATE TABLE agentic_accepted_orchestration_result_payloads (
      result_id uuid PRIMARY KEY,
      result_digest text NOT NULL CHECK(result_digest ~ '^[a-f0-9]{64}$'),
      payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
      payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      CHECK(octet_length(payload::text) <= 32768),
      FOREIGN KEY(result_id,result_digest)
        REFERENCES agentic_accepted_orchestration_results(id,result_digest) ON DELETE RESTRICT
    );

    CREATE TABLE agentic_executive_report_payloads (
      report_id uuid PRIMARY KEY,
      report_digest text NOT NULL CHECK(report_digest ~ '^[a-f0-9]{64}$'),
      payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
      payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      CHECK(octet_length(payload::text) <= 32768),
      FOREIGN KEY(report_id,report_digest)
        REFERENCES agentic_executive_reports(id,report_digest) ON DELETE RESTRICT
    );

    CREATE TRIGGER agentic_ai_ceo_execution_authorities_immutable
      BEFORE UPDATE OR DELETE ON agentic_ai_ceo_execution_authorities
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_ai_ceo_execution_payloads_immutable
      BEFORE UPDATE OR DELETE ON agentic_ai_ceo_execution_payloads
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_accepted_orchestration_result_payloads_immutable
      BEFORE UPDATE OR DELETE ON agentic_accepted_orchestration_result_payloads
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_executive_report_payloads_immutable
      BEFORE UPDATE OR DELETE ON agentic_executive_report_payloads
      FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS agentic_executive_report_payloads;
    DROP TABLE IF EXISTS agentic_accepted_orchestration_result_payloads;
    DROP TABLE IF EXISTS agentic_ai_ceo_execution_payloads;
    DROP TABLE IF EXISTS agentic_ai_ceo_execution_authorities;
    ALTER TABLE agentic_executive_reports
      DROP CONSTRAINT IF EXISTS agentic_executive_reports_id_digest_unique;
    ALTER TABLE agentic_accepted_orchestration_results
      DROP CONSTRAINT IF EXISTS agentic_accepted_orchestration_results_id_digest_unique;
  `);
}
