// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_executive_reports
      ADD COLUMN synthesis_branches_digest text
        CHECK(synthesis_branches_digest ~ '^[a-f0-9]{64}$');
    ALTER TABLE agentic_model_runs
      ADD COLUMN result_schema_name text
        CHECK(result_schema_name ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$'),
      ADD COLUMN result_schema_digest text
        CHECK(result_schema_digest ~ '^[a-f0-9]{64}$');
    CREATE OR REPLACE FUNCTION agentic_guard_model_run_transition() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      IF OLD.status IN ('completed','failed','partial','escalated') THEN
        RAISE EXCEPTION 'Terminal model runs are immutable' USING ERRCODE='P0001';
      END IF;
      IF ROW(NEW.id,NEW.task_id,NEW.agent_kind,NEW.configuration_revision_id,
        NEW.schema_version,NEW.generation_round,NEW.idempotency_key,NEW.requested_model,
        NEW.policy_version,NEW.configuration_version,NEW.result_schema_version,
        NEW.result_schema_name,NEW.result_schema_digest,NEW.input_digest,
        NEW.input_cost_micros_per_million,NEW.output_cost_micros_per_million,
        NEW.max_reserved_cost_micros,NEW.created_at) IS DISTINCT FROM
        ROW(OLD.id,OLD.task_id,OLD.agent_kind,OLD.configuration_revision_id,
        OLD.schema_version,OLD.generation_round,OLD.idempotency_key,OLD.requested_model,
        OLD.policy_version,OLD.configuration_version,OLD.result_schema_version,
        OLD.result_schema_name,OLD.result_schema_digest,OLD.input_digest,
        OLD.input_cost_micros_per_million,OLD.output_cost_micros_per_million,
        OLD.max_reserved_cost_micros,OLD.created_at) THEN
        RAISE EXCEPTION 'Model run request fields are immutable' USING ERRCODE='P0001';
      END IF;
      IF OLD.status='running' AND ROW(NEW.returned_model,NEW.fallback_position,NEW.started_at)
        IS DISTINCT FROM ROW(OLD.returned_model,OLD.fallback_position,OLD.started_at) THEN
        RAISE EXCEPTION 'Running model execution fields are immutable' USING ERRCODE='P0001';
      END IF;
      IF NOT ((OLD.status='reserved' AND NEW.status='running')
        OR (OLD.status='running' AND NEW.status IN ('completed','failed','partial','escalated'))) THEN
        RAISE EXCEPTION 'Invalid model run transition' USING ERRCODE='P0001';
      END IF;
      IF NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
        RAISE EXCEPTION 'Invalid model run version' USING ERRCODE='P0001';
      END IF;
      RETURN NEW;
    END; $f$;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION agentic_guard_model_run_transition() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      IF OLD.status IN ('completed','failed','partial','escalated') THEN
        RAISE EXCEPTION 'Terminal model runs are immutable' USING ERRCODE='P0001';
      END IF;
      IF ROW(NEW.id,NEW.task_id,NEW.agent_kind,NEW.configuration_revision_id,
        NEW.schema_version,NEW.generation_round,NEW.idempotency_key,NEW.requested_model,
        NEW.policy_version,NEW.configuration_version,NEW.result_schema_version,
        NEW.input_digest,NEW.input_cost_micros_per_million,
        NEW.output_cost_micros_per_million,NEW.max_reserved_cost_micros,NEW.created_at)
        IS DISTINCT FROM
        ROW(OLD.id,OLD.task_id,OLD.agent_kind,OLD.configuration_revision_id,
        OLD.schema_version,OLD.generation_round,OLD.idempotency_key,OLD.requested_model,
        OLD.policy_version,OLD.configuration_version,OLD.result_schema_version,
        OLD.input_digest,OLD.input_cost_micros_per_million,
        OLD.output_cost_micros_per_million,OLD.max_reserved_cost_micros,OLD.created_at) THEN
        RAISE EXCEPTION 'Model run request fields are immutable' USING ERRCODE='P0001';
      END IF;
      IF OLD.status='running' AND ROW(NEW.returned_model,NEW.fallback_position,NEW.started_at)
        IS DISTINCT FROM ROW(OLD.returned_model,OLD.fallback_position,OLD.started_at) THEN
        RAISE EXCEPTION 'Running model execution fields are immutable' USING ERRCODE='P0001';
      END IF;
      IF NOT ((OLD.status='reserved' AND NEW.status='running')
        OR (OLD.status='running' AND NEW.status IN ('completed','failed','partial','escalated'))) THEN
        RAISE EXCEPTION 'Invalid model run transition' USING ERRCODE='P0001';
      END IF;
      IF NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
        RAISE EXCEPTION 'Invalid model run version' USING ERRCODE='P0001';
      END IF;
      RETURN NEW;
    END; $f$;
    ALTER TABLE agentic_executive_reports
      DROP COLUMN IF EXISTS synthesis_branches_digest;
    ALTER TABLE agentic_model_runs
      DROP COLUMN IF EXISTS result_schema_digest,
      DROP COLUMN IF EXISTS result_schema_name;
  `);
}
