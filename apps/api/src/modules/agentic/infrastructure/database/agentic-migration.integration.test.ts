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
  "agentic_model_runs",
  "agentic_model_quality_evidence",
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
    expect((await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM agentic_migrations")).rows[0]?.count).toBe("8");

    await runAgenticMigrations(databaseUrl!, "down", 999_999);
    expect((await pool.query("SELECT to_regclass('public.agentic_tasks') AS name")).rows[0]).toEqual({ name: null });
    await runAgenticMigrations(databaseUrl!, "up");
    expect((await pool.query("SELECT to_regclass('public.agentic_tasks') AS name")).rows[0]).toEqual({ name: "agentic_tasks" });
  });

  it("enforces governed model run storage and append-only quality evidence", async () => {
    const revisionId = "a1900000-0000-4000-8000-000000000010";
    const taskId = "a1900000-0000-4000-8000-000000000011";
    const runId = "a1900000-0000-4000-8000-000000000012";
    const reservationId = "a1900000-0000-4000-8000-000000000013";
    await pool.query(
      "INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)",
      [revisionId, "a".repeat(64)],
    );
    await pool.query(
      `INSERT INTO agentic_model_configs
       (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,
        timeout_ms,max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
       VALUES($1,'catalog','google/gemma-4-26b-a4b-it:free',1000,500,30000,1,0,0)`,
      [revisionId],
    );
    await pool.query(
      "INSERT INTO agentic_tasks(id,state,created_by,goal,instructions,configuration_revision_id) VALUES($1,'ready','operator-a','Review','Evidence',$2)",
      [taskId, revisionId],
    );
    await pool.query(
      `INSERT INTO agentic_model_runs
       (id,task_id,agent_kind,configuration_revision_id,schema_version,generation_round,
        idempotency_key,requested_model,policy_version,configuration_version,
        result_schema_version,input_digest,input_cost_micros_per_million,
        output_cost_micros_per_million,max_reserved_cost_micros,status)
       VALUES($1,$2,'catalog',$3,1,0,'run:catalog:0','google/gemma-4-26b-a4b-it:free',
        1,1,1,$4,0,0,0,'reserved')`,
      [runId, taskId, revisionId, "b".repeat(64)],
    );

    await expect(pool.query(
      `INSERT INTO agentic_model_runs
       (id,task_id,agent_kind,configuration_revision_id,schema_version,generation_round,
        idempotency_key,requested_model,policy_version,configuration_version,
        result_schema_version,input_digest,input_cost_micros_per_million,
        output_cost_micros_per_million,max_reserved_cost_micros,status)
       VALUES(gen_random_uuid(),$1,'catalog',$2,1,0,'run:catalog:0','different-model',
        1,1,1,$3,0,0,0,'reserved')`,
      [taskId, revisionId, "c".repeat(64)],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "UPDATE agentic_model_runs SET status='completed',completed_at=now() WHERE id=$1",
      [runId],
    )).rejects.toMatchObject({ code: "P0001" });

    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at,model_run_id)
       VALUES($1,'catalog',$2,'reservation','budget:reserve',0,now(),$3)`,
      [reservationId, taskId, runId],
    );
    await expect(pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'catalog',$1,'reservation','budget:reserve:duplicate',0,now(),$2)`,
      [taskId, runId],
    )).rejects.toMatchObject({ code: "23505" });

    await pool.query(
      `UPDATE agentic_model_runs SET status='running',returned_model=requested_model,
       fallback_position=0,started_at=now(),version=2,updated_at=now() WHERE id=$1`,
      [runId],
    );
    await pool.query(
      `UPDATE agentic_model_runs SET status='completed',output_digest=$2,input_tokens=1,
       output_tokens=1,settled_cost_micros=0,provider_request_id_digest=$3,latency_ms=1,
       status_code='MODEL_RESULT_ACCEPTED',quality_reason_codes='{}',
       provenance_ids=ARRAY['evidence-1'],completed_at=now(),version=3,updated_at=now()
       WHERE id=$1`,
      [runId, "d".repeat(64), "e".repeat(64)],
    );
    await expect(pool.query(
      "UPDATE agentic_model_runs SET settled_cost_micros=1 WHERE id=$1",
      [runId],
    )).rejects.toMatchObject({ code: "P0001" });

    await pool.query(
      `INSERT INTO agentic_model_quality_evidence
       (id,model_run_id,generation_round,idempotency_key,outcome,reason_codes,
        provenance_ids,evidence_digest,recorded_at)
       VALUES(gen_random_uuid(),$1,0,'quality:0','accepted','{}',ARRAY['evidence-1'],$2,now())`,
      [runId, "f".repeat(64)],
    );
    await expect(pool.query(
      `INSERT INTO agentic_model_quality_evidence
       (id,model_run_id,generation_round,idempotency_key,outcome,reason_codes,
        provenance_ids,evidence_digest,recorded_at)
       VALUES(gen_random_uuid(),$1,1,'quality:wrong-round','correct',
        ARRAY['unsafe reason'],ARRAY['duplicate','duplicate'],$2,now())`,
      [runId, "1".repeat(64)],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      `INSERT INTO agentic_model_runs
       (id,task_id,agent_kind,configuration_revision_id,schema_version,generation_round,
        idempotency_key,requested_model,policy_version,configuration_version,
        result_schema_version,input_digest,input_cost_micros_per_million,
        output_cost_micros_per_million,max_reserved_cost_micros,status)
       VALUES(gen_random_uuid(),$1,'catalog',$2,1,1,'unsafe key','google/gemma-4-26b-a4b-it:free',
        1,1,1,$3,0,0,0,'reserved')`,
      [taskId, revisionId, "2".repeat(64)],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "UPDATE agentic_model_quality_evidence SET outcome='escalate' WHERE model_run_id=$1",
      [runId],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "DELETE FROM agentic_model_quality_evidence WHERE model_run_id=$1",
      [runId],
    )).rejects.toMatchObject({ code: "P0001" });

    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,
        occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'catalog',$1,'settlement','budget:settle',$2,0,now(),$3)`,
      [taskId, reservationId, runId],
    );
    await expect(pool.query(
      "INSERT INTO agentic_budget_entries(id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at,model_run_id) VALUES(gen_random_uuid(),'inventory',$1,'reservation','wrong-agent',0,now(),$2)",
      [taskId, runId],
    )).rejects.toMatchObject({ code: "23514" });

    await runAgenticMigrations(databaseUrl!, "down", 1);
    expect((await pool.query("SELECT to_regclass('public.agentic_model_runs') AS name")).rows[0])
      .toEqual({ name: null });
    const pricingColumns = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='agentic_model_configs' AND column_name LIKE '%cost_micros_per_million'",
    );
    expect(pricingColumns.rowCount).toBe(0);
    await runAgenticMigrations(databaseUrl!, "up");
  });

  it("preserves running execution fields and ordered lifecycle timestamps", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const revisionId = "a1900000-0000-4000-8000-000000000020";
      const taskId = "a1900000-0000-4000-8000-000000000021";
      const runId = "a1900000-0000-4000-8000-000000000022";
      await client.query(
        "INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)",
        [revisionId, "3".repeat(64)],
      );
      await client.query(
        `INSERT INTO agentic_model_configs
         (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
          max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
         VALUES($1,'catalog','model/primary',1000,500,30000,1,7,11)`,
        [revisionId],
      );
      await client.query(
        "INSERT INTO agentic_tasks(id,state,created_by,goal,instructions,configuration_revision_id) VALUES($1,'ready','operator-a','Review','Evidence',$2)",
        [taskId, revisionId],
      );
      await client.query("SAVEPOINT before_reversed");
      await expect(client.query(
        `INSERT INTO agentic_model_runs
         (id,task_id,agent_kind,configuration_revision_id,schema_version,generation_round,
          idempotency_key,requested_model,policy_version,configuration_version,
          result_schema_version,input_digest,input_cost_micros_per_million,
          output_cost_micros_per_million,max_reserved_cost_micros,status,created_at,updated_at)
         VALUES(gen_random_uuid(),$1,'catalog',$2,1,0,'time:reversed','model/primary',
          1,1,1,$3,7,11,1,'reserved',$5,$4)`,
        [taskId, revisionId, "4".repeat(64), "2026-08-19T00:59:59.000Z", "2026-08-19T01:00:00.000Z"],
      )).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT before_reversed").catch(() => undefined);
      await client.query(
        `INSERT INTO agentic_model_runs
         (id,task_id,agent_kind,configuration_revision_id,schema_version,generation_round,
          idempotency_key,requested_model,policy_version,configuration_version,
          result_schema_version,input_digest,input_cost_micros_per_million,
          output_cost_micros_per_million,max_reserved_cost_micros,status,created_at,updated_at)
         VALUES($1,$2,'catalog',$3,1,0,'run:immutable','model/primary',1,1,1,$4,7,11,1,
          'reserved',$5,$5)`,
        [runId, taskId, revisionId, "5".repeat(64), "2026-08-19T01:00:00.000Z"],
      );
      await client.query("SAVEPOINT before_early_start");
      await expect(client.query(
        `UPDATE agentic_model_runs SET status='running',returned_model='model/primary',
         fallback_position=0,started_at='2026-08-19T00:59:59.000Z',version=2,
         updated_at='2026-08-19T01:01:00.000Z' WHERE id=$1`,
        [runId],
      )).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT before_early_start");
      await client.query(
        `UPDATE agentic_model_runs SET status='running',returned_model='model/primary',
         fallback_position=0,started_at='2026-08-19T01:01:00.000Z',version=2,
         updated_at='2026-08-19T01:01:00.000Z' WHERE id=$1`,
        [runId],
      );

      const mutations = [
        "task_id=gen_random_uuid()",
        "agent_kind='inventory'",
        "configuration_revision_id=gen_random_uuid()",
        "schema_version=2",
        "generation_round=1",
        "idempotency_key='run:changed'",
        "requested_model='model/changed'",
        "returned_model='model/changed'",
        "fallback_position=1",
        "started_at='2026-08-19T01:00:30.000Z'",
        `input_digest='${"6".repeat(64)}'`,
        "max_reserved_cost_micros=0",
        "input_cost_micros_per_million=8",
        "output_cost_micros_per_million=12",
      ];
      for (const [index, mutation] of mutations.entries()) {
        const savepoint = `immutable_${index}`;
        await client.query(`SAVEPOINT ${savepoint}`);
        await expect(client.query(
          `UPDATE agentic_model_runs SET ${mutation},status='failed',input_tokens=0,
           output_tokens=0,settled_cost_micros=0,latency_ms=1,
           status_code='PROVIDER_UNAVAILABLE',error_code='PROVIDER_UNAVAILABLE',
           completed_at='2026-08-19T01:02:00.000Z',updated_at='2026-08-19T01:02:00.000Z',
           version=3 WHERE id=$1`,
          [runId],
        )).rejects.toMatchObject({ code: "P0001" });
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      }

      await client.query("SAVEPOINT before_early_completion");
      await expect(client.query(
        `UPDATE agentic_model_runs SET status='failed',input_tokens=0,output_tokens=0,
         settled_cost_micros=0,latency_ms=1,status_code='PROVIDER_UNAVAILABLE',
         error_code='PROVIDER_UNAVAILABLE',completed_at='2026-08-19T01:00:30.000Z',
         updated_at='2026-08-19T01:02:00.000Z',version=3 WHERE id=$1`,
        [runId],
      )).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT before_early_completion");
      await client.query(
        `UPDATE agentic_model_runs SET status='failed',input_tokens=0,output_tokens=0,
         settled_cost_micros=0,latency_ms=1,status_code='PROVIDER_UNAVAILABLE',
         error_code='PROVIDER_UNAVAILABLE',completed_at='2026-08-19T01:02:00.000Z',
         updated_at='2026-08-19T01:02:00.000Z',version=3 WHERE id=$1`,
        [runId],
      );
      expect((await client.query(
        `SELECT requested_model,returned_model,fallback_position,input_digest,
         input_cost_micros_per_million::text,max_reserved_cost_micros::text
         FROM agentic_model_runs WHERE id=$1`,
        [runId],
      )).rows[0]).toMatchObject({
        requested_model: "model/primary", returned_model: "model/primary",
        fallback_position: 0, input_digest: "5".repeat(64),
        input_cost_micros_per_million: "7", max_reserved_cost_micros: "1",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("keeps linked budget reservation and settlement costs coherent", async () => {
    const revisionId = "a1900000-0000-4000-8000-000000000030";
    const taskId = "a1900000-0000-4000-8000-000000000031";
    const paidRunId = "a1900000-0000-4000-8000-000000000032";
    const paidReservationId = "a1900000-0000-4000-8000-000000000033";
    const freeRunId = "a1900000-0000-4000-8000-000000000034";
    const freeReservationId = "a1900000-0000-4000-8000-000000000035";
    const unlinkedReservationId = "a1900000-0000-4000-8000-000000000036";
    await pool.query(
      "INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest) VALUES($1,'draft','admin-a',$2)",
      [revisionId, "7".repeat(64)],
    );
    await pool.query(
      `INSERT INTO agentic_model_configs
       (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
        max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
       VALUES($1,'catalog','model/paid',1000,500,30000,1,1000,1000)`,
      [revisionId],
    );
    await pool.query(
      `INSERT INTO agentic_model_configs
       (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
        max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
       VALUES($1,'inventory','model/free',1000,500,30000,1,0,0)`,
      [revisionId],
    );
    await pool.query(
      "INSERT INTO agentic_tasks(id,state,created_by,goal,instructions,configuration_revision_id) VALUES($1,'ready','operator-a','Review','Evidence',$2)",
      [taskId, revisionId],
    );
    const insertRun = async (
      id: string,
      key: string,
      maximum: number,
      agentKind = "catalog",
      model = "model/paid",
      rate = 1000,
    ) => pool.query(
      `INSERT INTO agentic_model_runs
       (id,task_id,agent_kind,configuration_revision_id,schema_version,generation_round,
        idempotency_key,requested_model,policy_version,configuration_version,
        result_schema_version,input_digest,input_cost_micros_per_million,
        output_cost_micros_per_million,max_reserved_cost_micros,status)
       VALUES($1,$2,$7,$3,1,0,$4,$8,1,1,1,$5,$9,$9,$6,'reserved')`,
      [id, taskId, revisionId, key, id.replaceAll("-", "").slice(0, 32).padEnd(64, "a"),
        maximum, agentKind, model, rate],
    );
    await insertRun(paidRunId, "budget:paid", 1500);
    await expect(pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'catalog',$1,'reservation','paid:wrong:1',1,now(),$2)`,
      [taskId, paidRunId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at,model_run_id)
       VALUES($1,'catalog',$2,'reservation','paid:reserve',1500,now(),$3)`,
      [paidReservationId, taskId, paidRunId],
    );
    await expect(pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,
        occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'catalog',$1,'settlement','paid:too-early',$2,2,now(),$3)`,
      [taskId, paidReservationId, paidRunId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `UPDATE agentic_model_runs SET status='running',returned_model=requested_model,
       fallback_position=0,started_at=now(),updated_at=now(),version=2 WHERE id=$1`,
      [paidRunId],
    );
    await pool.query(
      `UPDATE agentic_model_runs SET status='failed',input_tokens=1,output_tokens=1,
       settled_cost_micros=2,latency_ms=1,status_code='PROVIDER_UNAVAILABLE',
       error_code='PROVIDER_UNAVAILABLE',completed_at=now(),updated_at=now(),version=3
       WHERE id=$1`,
      [paidRunId],
    );
    await expect(pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,occurred_at)
       VALUES(gen_random_uuid(),'catalog',$1,'settlement','paid:null-run',$2,2,now())`,
      [taskId, paidReservationId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,
        occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'catalog',$1,'settlement','paid:wrong:0',$2,0,now(),$3)`,
      [taskId, paidReservationId, paidRunId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,
        occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'catalog',$1,'settlement','paid:settle',$2,2,now(),$3)`,
      [taskId, paidReservationId, paidRunId],
    );

    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at)
       VALUES($1,'catalog',$2,'reservation','unlinked:reserve',100,now())`,
      [unlinkedReservationId, taskId],
    );
    await expect(pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,
        occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'catalog',$1,'settlement','unlinked:wrong-run',$2,1,now(),$3)`,
      [taskId, unlinkedReservationId, paidRunId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,occurred_at)
       VALUES(gen_random_uuid(),'catalog',$1,'settlement','unlinked:settle',$2,1,now())`,
      [taskId, unlinkedReservationId],
    );

    await insertRun(freeRunId, "budget:free", 0, "inventory", "model/free", 0);
    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,cost_micros,occurred_at,model_run_id)
       VALUES($1,'inventory',$2,'reservation','free:reserve',0,now(),$3)`,
      [freeReservationId, taskId, freeRunId],
    );
    await pool.query(
      `UPDATE agentic_model_runs SET status='running',returned_model=requested_model,
       fallback_position=0,started_at=now(),updated_at=now(),version=2 WHERE id=$1`,
      [freeRunId],
    );
    await pool.query(
      `UPDATE agentic_model_runs SET status='completed',output_digest=$2,input_tokens=0,
       output_tokens=0,settled_cost_micros=0,provider_request_id_digest=$3,latency_ms=1,
       status_code='MODEL_RESULT_ACCEPTED',completed_at=now(),updated_at=now(),version=3
       WHERE id=$1`,
      [freeRunId, "8".repeat(64), "9".repeat(64)],
    );
    await pool.query(
      `INSERT INTO agentic_budget_entries
       (id,agent_kind,task_id,entry_type,idempotency_key,reservation_id,cost_micros,
        occurred_at,model_run_id)
       VALUES(gen_random_uuid(),'inventory',$1,'settlement','free:settle',$2,0,now(),$3)`,
      [taskId, freeReservationId, freeRunId],
    );
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

    await runAgenticMigrations(databaseUrl!, "down", 6);
    expect((await pool.query(
      "SELECT count(*)::text AS count FROM agentic_approval_requests WHERE approver_scope='workflow_execution'",
    )).rows[0]?.count).toBe("0");
    await runAgenticMigrations(databaseUrl!, "up");
  });
});
