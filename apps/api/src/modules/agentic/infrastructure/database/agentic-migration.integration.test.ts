// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { assertIntegrationEnvironment } from "../../../../shared/testing/assert-integration-environment";
import { runAgenticMigrations } from "./run-agentic-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

const tables = [
  "agentic_agents",
  "agentic_tasks",
  "agentic_subtasks",
  "agentic_subtask_dependencies",
  "agentic_configuration_revisions",
  "agentic_policies",
  "agentic_tools",
  "agentic_tool_grants",
  "agentic_model_configs",
  "agentic_model_fallbacks",
  "agentic_budget_limits",
  "agentic_budget_entries",
  "agentic_approval_requests",
  "agentic_revocations",
  "agentic_audit_events",
  "agentic_provenance_records",
  "agentic_workflow_runs",
  "agentic_activity_invocations",
  "agentic_workflow_signal_receipts",
  "agentic_tool_invocations",
] as const;

suite("Agent governance migration", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });

  afterAll(async () => {
    await runAgenticMigrations(databaseUrl!, "down", 999_999).catch(() => undefined);
    await pool.end();
  });

  it("creates, rolls back, and reapplies the normalized governance schema", async () => {
    await runAgenticMigrations(databaseUrl!, "up");

    const actual = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name",
      [tables],
    );
    expect(actual.rows.map(({ table_name }) => table_name)).toEqual([...tables].sort());
    expect((await pool.query("SELECT kind, keycloak_client_id FROM agentic_agents ORDER BY kind")).rowCount).toBe(7);
    expect((await pool.query<{ count: string }>("SELECT count(DISTINCT keycloak_client_id) AS count FROM agentic_agents")).rows[0]?.count).toBe("7");
    expect((await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM agentic_migrations")).rows[0]?.count).toBe("5");

    await runAgenticMigrations(databaseUrl!, "down", 999_999);
    expect((await pool.query("SELECT to_regclass('public.agentic_tasks') AS name")).rows[0]).toEqual({ name: null });
    await runAgenticMigrations(databaseUrl!, "up");
    expect((await pool.query("SELECT to_regclass('public.agentic_tasks') AS name")).rows[0]).toEqual({ name: "agentic_tasks" });
  });

  it("seeds immutable department tools and deduplicates invocation receipts", async () => {
    expect((await pool.query(
      "SELECT name FROM agentic_tools WHERE name LIKE '%.%' ORDER BY name",
    )).rowCount).toBe(17);
    await expect(pool.query(
      "UPDATE agentic_tools SET execution_cost_micros=2 WHERE name='catalog.product_completeness'",
    )).rejects.toMatchObject({ code: "P0001" });

    const taskId = "a1600000-0000-4000-8000-000000000001";
    const invocationId = "a1600000-0000-4000-8000-000000000002";
    const secondInvocationId = "a1600000-0000-4000-8000-000000000003";
    const digest = "a".repeat(64);
    const at = "2026-08-16T00:00:00.000Z";
    await pool.query(
      `INSERT INTO agentic_tasks(id,state,created_by,goal,instructions)
       VALUES($1,'draft','operator-a','Review store health','Use fixed tools')`,
      [taskId],
    );
    await pool.query(
      `INSERT INTO agentic_tool_invocations
       (id,task_id,agent_kind,tool_name,tool_version,idempotency_key,parameters_digest,status,
        attempt,correlation_id,causation_id,created_at,updated_at)
       VALUES($1,$2,'catalog','catalog.product_completeness',1,'same',$3,'reserved',1,'corr','cause',$4,$4)`,
      [invocationId, taskId, digest, at],
    );
    await expect(pool.query(
      `INSERT INTO agentic_tool_invocations
       (id,task_id,agent_kind,tool_name,tool_version,idempotency_key,parameters_digest,status,
        attempt,correlation_id,causation_id,created_at,updated_at)
       VALUES($1,$2,'catalog','catalog.product_completeness',1,'same',$3,'reserved',1,'corr-2','cause-2',$4,$4)`,
      [secondInvocationId, taskId, digest, at],
    )).rejects.toMatchObject({ code: "23505" });
    await pool.query(
      `UPDATE agentic_tool_invocations
       SET status='completed',safe_result=$2::jsonb,result_digest=$3,
           completed_at=$4,updated_at=$4,version=2
       WHERE id=$1`,
      [invocationId, JSON.stringify({ summary: { totalProducts: 2 } }), "b".repeat(64), at],
    );
    await expect(pool.query(
      "UPDATE agentic_tool_invocations SET safe_result='{}'::jsonb WHERE id=$1",
      [invocationId],
    )).rejects.toMatchObject({ code: "P0001" });
  });

  it("enforces identities, one active revision, approval separation, costs, and append-only evidence", async () => {
    await expect(pool.query(
      "INSERT INTO agentic_agents (kind, keycloak_client_id) VALUES ('catalog', 'agent-inventory')",
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "UPDATE agentic_agents SET keycloak_client_id='agent-forged' WHERE kind='catalog'",
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "DELETE FROM agentic_agents WHERE kind='catalog'",
    )).rejects.toMatchObject({ code: "P0001" });

    const first = "a1500000-0000-4000-8000-000000000001";
    const second = "a1500000-0000-4000-8000-000000000002";
    await pool.query(
      "INSERT INTO agentic_configuration_revisions (id, state, created_by, payload_digest, decided_by, decided_at) VALUES ($1, 'active', 'admin-a', $3, 'admin-c', now()), ($2, 'draft', 'admin-b', $4, NULL, NULL)",
      [first, second, "a".repeat(64), "b".repeat(64)],
    );
    await expect(pool.query(
      "UPDATE agentic_configuration_revisions SET state = 'active', decided_by = 'admin-d', decided_at = now(), version = 2, updated_at = now() WHERE id = $1",
      [second],
    )).rejects.toMatchObject({ code: "23505" });

    await expect(pool.query(
      "INSERT INTO agentic_approval_requests (id, state, requester_id, approver_scope, action, resource_type, resource_id, parameters_digest, policy_version, configuration_revision_id, expires_at, decided_by) VALUES (gen_random_uuid(), 'approved', 'same-user', 'governance_configuration', 'configuration.activate', 'configuration_revision', $1::text, $2, 1, $1::uuid, now() + interval '1 hour', 'same-user')",
      [first, "c".repeat(64)],
    )).rejects.toMatchObject({ code: "23514" });

    await expect(pool.query(
      "INSERT INTO agentic_budget_limits (revision_id, agent_kind, task_cost_micros, daily_cost_micros, monthly_cost_micros) VALUES ($1, 'catalog', -1, 2, 3)",
      [second],
    )).rejects.toMatchObject({ code: "23514" });

    const auditId = "a1500000-0000-4000-8000-000000000003";
    await pool.query(
      "INSERT INTO agentic_audit_events (id, actor_id, actor_type, action, resource_type, resource_id, outcome, correlation_id) VALUES ($1, 'admin-a', 'staff', 'configuration.created', 'configuration_revision', $2, 'allowed', 'corr-1')",
      [auditId, first],
    );
    await expect(pool.query(
      "UPDATE agentic_audit_events SET action = 'changed' WHERE id = $1",
      [auditId],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("DELETE FROM agentic_audit_events WHERE id = $1", [auditId]))
      .rejects.toMatchObject({ code: "P0001" });

    const provenanceId = "a1500000-0000-4000-8000-000000000004";
    await pool.query(
      "INSERT INTO agentic_provenance_records (id, source_type, source_id, source_digest, classification, recorded_by) VALUES ($1, 'database', 'catalog.products', $2, 'internal', 'agent-catalog')",
      [provenanceId, "d".repeat(64)],
    );
    await expect(pool.query("DELETE FROM agentic_provenance_records WHERE id=$1", [provenanceId]))
      .rejects.toMatchObject({ code: "P0001" });

    const policyId = "a1500000-0000-4000-8000-000000000005";
    await pool.query(
      "INSERT INTO agentic_policies (id,revision_id,rule_order,effect,actor_type,resource,action,purpose,data_classification,reason_code) VALUES($1,$2,1,'DENY','agent','catalog','read','analysis','internal','default-deny')",
      [policyId, second],
    );
    await pool.query(
      "UPDATE agentic_configuration_revisions SET state='pending_approval',version=2,updated_at=now() WHERE id=$1",
      [second],
    );
    await expect(pool.query("UPDATE agentic_policies SET reason_code='forged' WHERE id=$1", [policyId]))
      .rejects.toMatchObject({ code: "P0001" });

    await pool.query(
      "INSERT INTO agentic_tools(name,version,input_schema_digest,output_schema_digest) VALUES('catalog.health',1,$1,$2)",
      ["e".repeat(64), "f".repeat(64)],
    );
    await expect(pool.query("UPDATE agentic_tools SET active=false WHERE name='catalog.health' AND version=1"))
      .rejects.toMatchObject({ code: "P0001" });
  });

  it("enforces workflow run, invocation, and signal invariants", async () => {
    const revisionId = "a1700000-0000-4000-8000-000000000010";
    const taskId = "a1700000-0000-4000-8000-000000000011";
    const runId = "a1700000-0000-4000-8000-000000000012";
    const subtaskId = "a1700000-0000-4000-8000-000000000013";
    const approvalId = "a1700000-0000-4000-8000-000000000014";
    await pool.query(
      `INSERT INTO agentic_configuration_revisions
       (id,state,created_by,payload_digest)
       VALUES($1,'draft','governance-a',$2)`,
      [revisionId, "1".repeat(64)],
    );
    await pool.query(
      `INSERT INTO agentic_tasks
       (id,state,created_by,goal,instructions,configuration_revision_id,version)
       VALUES($1,'ready','operator-a','Review store health','Use fixed plan',$2,2)`,
      [taskId, revisionId],
    );
    await pool.query(
      `INSERT INTO agentic_subtasks(id,task_id,agent_kind,title)
       VALUES($1,$2,'catalog','Review catalog health')`,
      [subtaskId, taskId],
    );
    await pool.query(
      `INSERT INTO agentic_approval_requests
       (id,state,requester_id,approver_scope,action,resource_type,resource_id,
        parameters_digest,task_id,policy_version,workflow_version,
        configuration_revision_id,expires_at)
       VALUES($1,'pending','system:workflow','workflow_execution',
        'agentic.workflow.complete','workflow_run',$3,$4,$2,1,1,$5,now()+interval '1 hour')`,
      [approvalId, taskId, runId, "2".repeat(64), revisionId],
    );
    await pool.query(
      `INSERT INTO agentic_workflow_runs
       (id,task_id,workflow_name,workflow_version,plan_revision,
        temporal_workflow_id,state,projection_sequence,version)
       VALUES($1,$2,'StoreHealthReviewWorkflowV1',1,2,$3,'received',0,1)`,
      [runId, taskId, `store-health-v1:${runId}`],
    );

    await expect(pool.query(
      `INSERT INTO agentic_workflow_runs
       (id,task_id,workflow_name,workflow_version,plan_revision,
        temporal_workflow_id,state,projection_sequence,version)
       VALUES(gen_random_uuid(),$1,'StoreHealthReviewWorkflowV1',1,3,$2,'planning',1,1)`,
      [taskId, "store-health-v1:duplicate-active"],
    )).rejects.toMatchObject({ code: "23505" });

    await expect(pool.query(
      `UPDATE agentic_workflow_runs
       SET state='completed',outcome_code='RETRY_EXHAUSTED',completed_at=now()
       WHERE id=$1`,
      [runId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `UPDATE agentic_workflow_runs
       SET state='failed',outcome_code='ACTIVITY_REJECTED',completed_at=now()
       WHERE id=$1`,
      [runId],
    );

    await expect(pool.query(
      `INSERT INTO agentic_activity_invocations
       (invocation_key,workflow_run_id,activity_kind,branch_id,input_digest,state)
       VALUES('bad-digest',$1,'execute_fake_analysis',$2,'not-a-digest','reserved')`,
      [runId, subtaskId],
    )).rejects.toMatchObject({ code: "23514" });

    await pool.query(
      `INSERT INTO agentic_activity_invocations
       (invocation_key,workflow_run_id,activity_kind,branch_id,input_digest,state)
       VALUES($1,$2,'execute_fake_analysis',$3,$4,'reserved')`,
      [`${runId}:1:execute_fake_analysis:${subtaskId}:${"3".repeat(64)}`, runId, subtaskId, "3".repeat(64)],
    );
    await expect(pool.query(
      `UPDATE agentic_activity_invocations
       SET state='completed',safe_result=$2::jsonb,completed_at=now()
       WHERE workflow_run_id=$1`,
      [runId, JSON.stringify({ report: "x".repeat(16_385) })],
    )).rejects.toMatchObject({ code: "23514" });

    await expect(pool.query(
      `INSERT INTO agentic_workflow_signal_receipts
       (id,workflow_run_id,signal_kind,idempotency_key,approval_id,
        payload_digest,delivery_state)
       VALUES(gen_random_uuid(),$1,'cancellation','cancel-invalid',$2,$3,'pending')`,
      [runId, approvalId, "4".repeat(64)],
    )).rejects.toMatchObject({ code: "23514" });

    await expect(pool.query(
      `INSERT INTO agentic_workflow_signal_receipts
       (id,workflow_run_id,signal_kind,idempotency_key,payload_digest,
        decision,application_decision_version,delivery_state)
       VALUES(gen_random_uuid(),$1,'approval','approval-invalid',$2,
        'approved',2,'pending')`,
      [runId, "5".repeat(64)],
    )).rejects.toMatchObject({ code: "23514" });

    await pool.query(
      `INSERT INTO agentic_workflow_signal_receipts
       (id,workflow_run_id,signal_kind,idempotency_key,approval_id,
        payload_digest,decision,application_decision_version,delivery_state)
       VALUES(gen_random_uuid(),$1,'approval','approval-valid',$2,$3,
        'approved',2,'pending')`,
      [runId, approvalId, "6".repeat(64)],
    );
    await pool.query(
      `INSERT INTO agentic_workflow_signal_receipts
       (id,workflow_run_id,signal_kind,idempotency_key,payload_digest,
        reason_code,delivery_state)
       VALUES(gen_random_uuid(),$1,'cancellation','cancellation-valid',$2,
        'CANCELED_BY_OPERATOR','pending')`,
      [runId, "7".repeat(64)],
    );
    await expect(pool.query(
       `INSERT INTO agentic_workflow_signal_receipts
       (id,workflow_run_id,signal_kind,idempotency_key,payload_digest,
        reason_code,delivery_state)
       VALUES(gen_random_uuid(),$1,'cancellation','approval-valid',$2,
        'CANCELED_BY_OPERATOR','pending')`,
      [runId, "8".repeat(64)],
    )).rejects.toMatchObject({ code: "23505" });

    await runAgenticMigrations(databaseUrl!, "down", 3);
    expect((await pool.query(
      "SELECT count(*)::text AS count FROM agentic_approval_requests WHERE approver_scope='workflow_execution'",
    )).rows[0]?.count).toBe("0");
    await runAgenticMigrations(databaseUrl!, "up");
  });
});
