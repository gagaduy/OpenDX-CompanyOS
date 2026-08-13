// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE agentic_agents (
      kind text PRIMARY KEY CHECK (kind IN ('ai_ceo','catalog','inventory','order','finance','crm','support')),
      keycloak_client_id text NOT NULL UNIQUE CHECK (length(btrim(keycloak_client_id)) BETWEEN 1 AND 255),
      active boolean NOT NULL DEFAULT true,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO agentic_agents(kind,keycloak_client_id) VALUES
      ('ai_ceo','agent-ai-ceo'),('catalog','agent-catalog'),('inventory','agent-inventory'),
      ('order','agent-order'),('finance','agent-finance'),('crm','agent-crm'),('support','agent-support');

    CREATE TABLE agentic_configuration_revisions (
      id uuid PRIMARY KEY, state text NOT NULL CHECK (state IN ('draft','pending_approval','active','rejected','superseded')),
      created_by text NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 255),
      payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
      decided_by text, decision_reason text, decided_at timestamptz,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT agentic_configuration_decision_check CHECK (
        (state IN ('draft','pending_approval') AND decided_by IS NULL AND decided_at IS NULL)
        OR (state IN ('active','rejected','superseded') AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decided_by <> created_by)
      )
    );
    CREATE UNIQUE INDEX agentic_configuration_one_active_idx ON agentic_configuration_revisions ((true)) WHERE state='active';

    CREATE TABLE agentic_tasks (
      id uuid PRIMARY KEY, state text NOT NULL CHECK (state IN ('draft','ready','canceled')),
      created_by text NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 255),
      goal text NOT NULL CHECK (length(btrim(goal)) BETWEEN 1 AND 500),
      instructions text NOT NULL CHECK (length(instructions) <= 8000), deadline timestamptz,
      configuration_revision_id uuid REFERENCES agentic_configuration_revisions(id),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT agentic_tasks_ready_revision_check CHECK (state <> 'ready' OR configuration_revision_id IS NOT NULL)
    );
    CREATE INDEX agentic_tasks_owner_created_idx ON agentic_tasks(created_by,created_at DESC,id);

    CREATE TABLE agentic_subtasks (
      id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES agentic_tasks(id) ON DELETE CASCADE,
      agent_kind text NOT NULL REFERENCES agentic_agents(kind), title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
      version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX agentic_subtasks_task_id_id_key ON agentic_subtasks(task_id,id);
    CREATE TABLE agentic_subtask_dependencies (
      task_id uuid NOT NULL REFERENCES agentic_tasks(id) ON DELETE CASCADE,
      from_subtask_id uuid NOT NULL, to_subtask_id uuid NOT NULL,
      PRIMARY KEY(task_id,from_subtask_id,to_subtask_id),
      FOREIGN KEY(task_id,from_subtask_id) REFERENCES agentic_subtasks(task_id,id) ON DELETE CASCADE,
      FOREIGN KEY(task_id,to_subtask_id) REFERENCES agentic_subtasks(task_id,id) ON DELETE CASCADE,
      CHECK(from_subtask_id<>to_subtask_id)
    );

    CREATE TABLE agentic_policies (
      id uuid PRIMARY KEY, revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id) ON DELETE CASCADE,
      rule_order integer NOT NULL CHECK(rule_order>=0), effect text NOT NULL CHECK(effect IN ('ALLOW','REQUIRE_APPROVAL','DENY')),
      actor_type text NOT NULL, agent_kind text, department text, resource text NOT NULL, action text NOT NULL,
      purpose text NOT NULL, data_classification text NOT NULL, reason_code text NOT NULL,
      UNIQUE(revision_id,rule_order), FOREIGN KEY(agent_kind) REFERENCES agentic_agents(kind)
    );
    CREATE TABLE agentic_tools (
      name text NOT NULL, version integer NOT NULL CHECK(version>0), input_schema_digest text NOT NULL CHECK(input_schema_digest~'^[a-f0-9]{64}$'),
      output_schema_digest text NOT NULL CHECK(output_schema_digest~'^[a-f0-9]{64}$'), active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(name,version)
    );
    CREATE TABLE agentic_tool_grants (
      id uuid PRIMARY KEY, revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id) ON DELETE CASCADE,
      agent_kind text NOT NULL REFERENCES agentic_agents(kind), tool_name text NOT NULL, tool_version integer NOT NULL,
      purpose text NOT NULL, data_scope text NOT NULL, max_invocations integer NOT NULL CHECK(max_invocations>0),
      FOREIGN KEY(tool_name,tool_version) REFERENCES agentic_tools(name,version), UNIQUE(revision_id,agent_kind,tool_name,tool_version,purpose,data_scope)
    );
    CREATE TABLE agentic_model_configs (
      revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id) ON DELETE CASCADE,
      agent_kind text NOT NULL REFERENCES agentic_agents(kind), primary_model text NOT NULL,
      max_input_tokens integer NOT NULL CHECK(max_input_tokens>0), max_output_tokens integer NOT NULL CHECK(max_output_tokens>0),
      timeout_ms integer NOT NULL CHECK(timeout_ms>0), max_retries integer NOT NULL CHECK(max_retries>=0),
      PRIMARY KEY(revision_id,agent_kind)
    );
    CREATE TABLE agentic_model_fallbacks (
      revision_id uuid NOT NULL, agent_kind text NOT NULL, position integer NOT NULL CHECK(position BETWEEN 1 AND 5), model text NOT NULL,
      PRIMARY KEY(revision_id,agent_kind,position), UNIQUE(revision_id,agent_kind,model),
      FOREIGN KEY(revision_id,agent_kind) REFERENCES agentic_model_configs(revision_id,agent_kind) ON DELETE CASCADE
    );
    CREATE TABLE agentic_budget_limits (
      revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id) ON DELETE CASCADE,
      agent_kind text NOT NULL REFERENCES agentic_agents(kind), task_cost_micros bigint NOT NULL, daily_cost_micros bigint NOT NULL,
      monthly_cost_micros bigint NOT NULL, PRIMARY KEY(revision_id,agent_kind),
      CHECK(task_cost_micros>0 AND task_cost_micros<=daily_cost_micros AND daily_cost_micros<=monthly_cost_micros)
    );
    CREATE TABLE agentic_budget_entries (
      id uuid PRIMARY KEY, agent_kind text NOT NULL REFERENCES agentic_agents(kind), task_id uuid NOT NULL REFERENCES agentic_tasks(id),
      entry_type text NOT NULL CHECK(entry_type IN ('reservation','settlement')), idempotency_key text NOT NULL UNIQUE,
      reservation_id uuid REFERENCES agentic_budget_entries(id), cost_micros bigint NOT NULL CHECK(cost_micros>=0), occurred_at timestamptz NOT NULL,
      CHECK((entry_type='reservation' AND reservation_id IS NULL) OR (entry_type='settlement' AND reservation_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX agentic_budget_one_settlement_idx
      ON agentic_budget_entries(reservation_id) WHERE entry_type='settlement';

    CREATE TABLE agentic_approval_requests (
      id uuid PRIMARY KEY, state text NOT NULL CHECK(state IN ('pending','approved','rejected','revision_requested')),
      requester_id text NOT NULL, action text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL,
      parameters_digest text NOT NULL CHECK(parameters_digest~'^[a-f0-9]{64}$'), task_id uuid REFERENCES agentic_tasks(id),
      policy_version integer NOT NULL CHECK(policy_version>0), workflow_version integer,
      configuration_revision_id uuid NOT NULL REFERENCES agentic_configuration_revisions(id), expires_at timestamptz NOT NULL,
      decided_by text, decision_reason text, decided_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(),
      CHECK((state='pending' AND decided_by IS NULL AND decided_at IS NULL) OR (state<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decided_by<>requester_id))
    );
    CREATE TABLE agentic_revocations (
      id uuid PRIMARY KEY, target_type text NOT NULL CHECK(target_type IN ('agent','tool_grant','model')),
      target_id text NOT NULL, reason text NOT NULL, activated_by text NOT NULL, activated_at timestamptz NOT NULL,
      approval_id uuid REFERENCES agentic_approval_requests(id), idempotency_key text NOT NULL UNIQUE
    );
    CREATE INDEX agentic_revocations_target_idx ON agentic_revocations(target_type,target_id,activated_at DESC);

    CREATE TABLE agentic_audit_events (
      id uuid PRIMARY KEY, actor_id text NOT NULL, actor_type text NOT NULL CHECK(actor_type IN ('staff','agent','system')),
      task_id uuid REFERENCES agentic_tasks(id), action text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL,
      outcome text NOT NULL CHECK(outcome IN ('allowed','denied','failed')), policy_version integer, model_version integer, tool_version integer,
      correlation_id text NOT NULL, causation_id text, occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX agentic_audit_filter_idx ON agentic_audit_events(occurred_at DESC,actor_id,action,outcome);
    CREATE TABLE agentic_provenance_records (
      id uuid PRIMARY KEY, task_id uuid REFERENCES agentic_tasks(id), source_type text NOT NULL, source_id text NOT NULL,
      source_digest text NOT NULL CHECK(source_digest~'^[a-f0-9]{64}$'), classification text NOT NULL,
      recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE FUNCTION agentic_prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN RAISE EXCEPTION 'Agentic evidence is append-only' USING ERRCODE='P0001'; END; $f$;
    CREATE TRIGGER agentic_audit_immutable BEFORE UPDATE OR DELETE ON agentic_audit_events FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_provenance_immutable BEFORE UPDATE OR DELETE ON agentic_provenance_records FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
    CREATE TRIGGER agentic_tools_immutable BEFORE UPDATE OR DELETE ON agentic_tools FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();

    CREATE FUNCTION agentic_guard_draft_children() RETURNS trigger LANGUAGE plpgsql AS $f$
      DECLARE target_revision uuid;
      BEGIN
        target_revision := CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
        IF NOT EXISTS (
          SELECT 1 FROM agentic_configuration_revisions
          WHERE id=target_revision AND state='draft'
        ) THEN
          RAISE EXCEPTION 'Configuration children are immutable after submission' USING ERRCODE='P0001';
        END IF;
        RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
      END; $f$;
    CREATE TRIGGER agentic_policies_draft_only BEFORE INSERT OR UPDATE OR DELETE ON agentic_policies FOR EACH ROW EXECUTE FUNCTION agentic_guard_draft_children();
    CREATE TRIGGER agentic_tool_grants_draft_only BEFORE INSERT OR UPDATE OR DELETE ON agentic_tool_grants FOR EACH ROW EXECUTE FUNCTION agentic_guard_draft_children();
    CREATE TRIGGER agentic_model_configs_draft_only BEFORE INSERT OR UPDATE OR DELETE ON agentic_model_configs FOR EACH ROW EXECUTE FUNCTION agentic_guard_draft_children();
    CREATE TRIGGER agentic_model_fallbacks_draft_only BEFORE INSERT OR UPDATE OR DELETE ON agentic_model_fallbacks FOR EACH ROW EXECUTE FUNCTION agentic_guard_draft_children();
    CREATE TRIGGER agentic_budget_limits_draft_only BEFORE INSERT OR UPDATE OR DELETE ON agentic_budget_limits FOR EACH ROW EXECUTE FUNCTION agentic_guard_draft_children();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TRIGGER IF EXISTS agentic_provenance_immutable ON agentic_provenance_records;
    DROP TRIGGER IF EXISTS agentic_audit_immutable ON agentic_audit_events;
    DROP TRIGGER IF EXISTS agentic_tools_immutable ON agentic_tools;
    DROP FUNCTION IF EXISTS agentic_prevent_mutation;
    DROP TABLE agentic_provenance_records, agentic_audit_events, agentic_revocations,
      agentic_approval_requests, agentic_budget_entries, agentic_budget_limits,
      agentic_model_fallbacks, agentic_model_configs, agentic_tool_grants,
      agentic_tools, agentic_policies, agentic_subtask_dependencies,
      agentic_subtasks, agentic_tasks, agentic_configuration_revisions,
      agentic_agents;
    DROP FUNCTION IF EXISTS agentic_guard_draft_children;
  `);
}
