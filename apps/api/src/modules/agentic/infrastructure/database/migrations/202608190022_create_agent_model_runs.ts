// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE agentic_model_configs
      ADD COLUMN input_cost_micros_per_million bigint NOT NULL DEFAULT 0,
      ADD COLUMN output_cost_micros_per_million bigint NOT NULL DEFAULT 0;
    ALTER TABLE agentic_model_configs
      ALTER COLUMN input_cost_micros_per_million DROP DEFAULT,
      ALTER COLUMN output_cost_micros_per_million DROP DEFAULT,
      ADD CONSTRAINT agentic_model_input_price_check
        CHECK(input_cost_micros_per_million BETWEEN 0 AND 9007199254740991),
      ADD CONSTRAINT agentic_model_output_price_check
        CHECK(output_cost_micros_per_million BETWEEN 0 AND 9007199254740991);

    CREATE FUNCTION agentic_is_safe_code_array(input_values text[], maximum integer)
      RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
      SELECT cardinality(input_values)<=maximum
        AND cardinality(input_values)=(SELECT count(DISTINCT value) FROM unnest(input_values) value)
        AND COALESCE((SELECT bool_and(value~'^[A-Z][A-Z0-9_]{0,63}$')
          FROM unnest(input_values) value),true); $f$;
    CREATE FUNCTION agentic_is_safe_identifier_array(input_values text[], maximum integer)
      RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
      SELECT cardinality(input_values)<=maximum
        AND cardinality(input_values)=(SELECT count(DISTINCT value) FROM unnest(input_values) value)
        AND COALESCE((SELECT bool_and(value~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$')
          FROM unnest(input_values) value),true); $f$;

    CREATE TABLE agentic_model_runs (
      id uuid PRIMARY KEY,
      task_id uuid NOT NULL REFERENCES agentic_tasks(id),
      agent_kind text NOT NULL REFERENCES agentic_agents(kind),
      configuration_revision_id uuid NOT NULL,
      schema_version integer NOT NULL CHECK(schema_version>0),
      generation_round integer NOT NULL CHECK(generation_round BETWEEN 0 AND 2),
      idempotency_key text NOT NULL UNIQUE
        CHECK(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$'),
      requested_model text NOT NULL
        CHECK(requested_model~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$'),
      returned_model text
        CHECK(returned_model~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$'),
      fallback_position integer CHECK(fallback_position BETWEEN 0 AND 1),
      policy_version integer NOT NULL CHECK(policy_version>0),
      configuration_version integer NOT NULL CHECK(configuration_version>0),
      result_schema_version integer NOT NULL CHECK(result_schema_version>0),
      input_digest text NOT NULL CHECK(input_digest~'^[a-f0-9]{64}$'),
      output_digest text CHECK(output_digest~'^[a-f0-9]{64}$'),
      input_tokens bigint CHECK(input_tokens BETWEEN 0 AND 9007199254740991),
      output_tokens bigint CHECK(output_tokens BETWEEN 0 AND 9007199254740991),
      input_cost_micros_per_million bigint NOT NULL
        CHECK(input_cost_micros_per_million BETWEEN 0 AND 9007199254740991),
      output_cost_micros_per_million bigint NOT NULL
        CHECK(output_cost_micros_per_million BETWEEN 0 AND 9007199254740991),
      max_reserved_cost_micros bigint NOT NULL
        CHECK(max_reserved_cost_micros BETWEEN 0 AND 9007199254740991),
      settled_cost_micros bigint CHECK(settled_cost_micros BETWEEN 0 AND max_reserved_cost_micros),
      provider_request_id_digest text CHECK(provider_request_id_digest~'^[a-f0-9]{64}$'),
      latency_ms bigint CHECK(latency_ms BETWEEN 0 AND 9007199254740991),
      status text NOT NULL CHECK(status IN ('reserved','running','completed','failed','partial','escalated')),
      status_code text CHECK(status_code~'^[A-Z][A-Z0-9_]{0,63}$'),
      error_code text CHECK(error_code~'^[A-Z][A-Z0-9_]{0,63}$'),
      quality_reason_codes text[] NOT NULL DEFAULT '{}',
      provenance_ids text[] NOT NULL DEFAULT '{}',
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz,
      FOREIGN KEY(configuration_revision_id,agent_kind)
        REFERENCES agentic_model_configs(revision_id,agent_kind),
      UNIQUE(id,generation_round),
      CHECK(agentic_is_safe_code_array(quality_reason_codes,32)),
      CHECK(agentic_is_safe_identifier_array(provenance_ids,128)),
      CHECK(updated_at>=created_at),
      CHECK(
        (status='reserved' AND returned_model IS NULL AND fallback_position IS NULL
          AND started_at IS NULL AND completed_at IS NULL AND input_tokens IS NULL
          AND output_tokens IS NULL AND settled_cost_micros IS NULL AND latency_ms IS NULL
          AND status_code IS NULL AND error_code IS NULL AND output_digest IS NULL
          AND provider_request_id_digest IS NULL)
        OR
        (status='running' AND returned_model IS NOT NULL AND fallback_position IS NOT NULL
          AND started_at IS NOT NULL AND completed_at IS NULL AND input_tokens IS NULL
          AND output_tokens IS NULL AND settled_cost_micros IS NULL AND latency_ms IS NULL
          AND status_code IS NULL AND error_code IS NULL AND output_digest IS NULL
          AND provider_request_id_digest IS NULL AND started_at>=created_at
          AND updated_at>=started_at)
        OR
        (status IN ('completed','failed','partial','escalated')
          AND returned_model IS NOT NULL AND fallback_position IS NOT NULL
          AND started_at IS NOT NULL AND completed_at IS NOT NULL
          AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL
          AND settled_cost_micros IS NOT NULL AND latency_ms IS NOT NULL
          AND status_code IS NOT NULL AND started_at>=created_at
          AND completed_at>=started_at AND updated_at>=completed_at
          AND (status<>'completed' OR (output_digest IS NOT NULL
            AND provider_request_id_digest IS NOT NULL)))
      )
    );
    CREATE INDEX agentic_model_runs_task_idx
      ON agentic_model_runs(task_id,agent_kind,generation_round,created_at,id);

    CREATE FUNCTION agentic_guard_model_run_transition() RETURNS trigger LANGUAGE plpgsql AS $f$
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
    CREATE TRIGGER agentic_model_runs_transition
      BEFORE UPDATE ON agentic_model_runs FOR EACH ROW
      EXECUTE FUNCTION agentic_guard_model_run_transition();
    CREATE TRIGGER agentic_model_runs_no_delete
      BEFORE DELETE ON agentic_model_runs FOR EACH ROW
      EXECUTE FUNCTION agentic_prevent_mutation();

    CREATE TABLE agentic_model_quality_evidence (
      id uuid PRIMARY KEY,
      model_run_id uuid NOT NULL,
      generation_round integer NOT NULL CHECK(generation_round BETWEEN 0 AND 2),
      idempotency_key text NOT NULL UNIQUE
        CHECK(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$'),
      outcome text NOT NULL CHECK(outcome IN ('accepted','correct','partial','escalate')),
      reason_codes text[] NOT NULL DEFAULT '{}',
      provenance_ids text[] NOT NULL DEFAULT '{}',
      evidence_digest text NOT NULL CHECK(evidence_digest~'^[a-f0-9]{64}$'),
      recorded_at timestamptz NOT NULL,
      CHECK(agentic_is_safe_code_array(reason_codes,32)),
      CHECK(agentic_is_safe_identifier_array(provenance_ids,128)),
      FOREIGN KEY(model_run_id,generation_round)
        REFERENCES agentic_model_runs(id,generation_round),
      UNIQUE(model_run_id,generation_round,evidence_digest)
    );
    CREATE INDEX agentic_model_quality_run_idx
      ON agentic_model_quality_evidence(model_run_id,recorded_at,id);
    CREATE TRIGGER agentic_model_quality_evidence_immutable
      BEFORE UPDATE OR DELETE ON agentic_model_quality_evidence FOR EACH ROW
      EXECUTE FUNCTION agentic_prevent_mutation();

    ALTER TABLE agentic_budget_entries ADD COLUMN model_run_id uuid
      REFERENCES agentic_model_runs(id);
    CREATE UNIQUE INDEX agentic_budget_one_model_reservation_idx
      ON agentic_budget_entries(model_run_id)
      WHERE entry_type='reservation' AND model_run_id IS NOT NULL;
    CREATE UNIQUE INDEX agentic_budget_one_model_settlement_idx
      ON agentic_budget_entries(model_run_id)
      WHERE entry_type='settlement' AND model_run_id IS NOT NULL;

    CREATE FUNCTION agentic_validate_model_budget_reference() RETURNS trigger LANGUAGE plpgsql AS $f$
    DECLARE
      run_task uuid;
      run_agent text;
      run_status text;
      run_maximum bigint;
      run_settled bigint;
      reserved_run uuid;
      reserved_cost bigint;
    BEGIN
      IF NEW.entry_type='settlement' THEN
        SELECT model_run_id,cost_micros INTO reserved_run,reserved_cost FROM agentic_budget_entries
          WHERE id=NEW.reservation_id AND entry_type='reservation';
        IF reserved_run IS DISTINCT FROM NEW.model_run_id THEN
          RAISE EXCEPTION 'Settlement model run does not match reservation' USING ERRCODE='23514';
        END IF;
      END IF;
      IF NEW.model_run_id IS NULL THEN RETURN NEW; END IF;
      SELECT task_id,agent_kind,status,max_reserved_cost_micros,settled_cost_micros
        INTO run_task,run_agent,run_status,run_maximum,run_settled
        FROM agentic_model_runs WHERE id=NEW.model_run_id;
      IF run_task IS NULL OR run_task<>NEW.task_id OR run_agent<>NEW.agent_kind THEN
        RAISE EXCEPTION 'Invalid model run budget reference' USING ERRCODE='23514';
      END IF;
      IF NEW.entry_type='reservation'
        AND (run_status<>'reserved' OR NEW.cost_micros<>run_maximum) THEN
        RAISE EXCEPTION 'Model run reservation cost or status is invalid' USING ERRCODE='23514';
      END IF;
      IF NEW.entry_type='settlement' AND (
        run_status NOT IN ('completed','failed','partial','escalated')
        OR run_settled IS NULL
        OR NEW.cost_micros<>run_settled
        OR NEW.cost_micros>reserved_cost
      ) THEN
        RAISE EXCEPTION 'Model run settlement cost or status is invalid' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $f$;
    CREATE TRIGGER agentic_budget_model_run_reference
      BEFORE INSERT OR UPDATE ON agentic_budget_entries FOR EACH ROW
      EXECUTE FUNCTION agentic_validate_model_budget_reference();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS agentic_budget_model_run_reference ON agentic_budget_entries;
    DROP FUNCTION IF EXISTS agentic_validate_model_budget_reference;
    DROP INDEX IF EXISTS agentic_budget_one_model_settlement_idx;
    DROP INDEX IF EXISTS agentic_budget_one_model_reservation_idx;
    ALTER TABLE agentic_budget_entries DROP COLUMN IF EXISTS model_run_id;
    DROP TABLE IF EXISTS agentic_model_quality_evidence;
    DROP TRIGGER IF EXISTS agentic_model_runs_no_delete ON agentic_model_runs;
    DROP TRIGGER IF EXISTS agentic_model_runs_transition ON agentic_model_runs;
    DROP FUNCTION IF EXISTS agentic_guard_model_run_transition;
    DROP TABLE IF EXISTS agentic_model_runs;
    DROP FUNCTION IF EXISTS agentic_is_safe_identifier_array;
    DROP FUNCTION IF EXISTS agentic_is_safe_code_array;
    ALTER TABLE agentic_model_configs
      DROP CONSTRAINT IF EXISTS agentic_model_output_price_check,
      DROP CONSTRAINT IF EXISTS agentic_model_input_price_check,
      DROP COLUMN IF EXISTS output_cost_micros_per_million,
      DROP COLUMN IF EXISTS input_cost_micros_per_million;
  `);
}
