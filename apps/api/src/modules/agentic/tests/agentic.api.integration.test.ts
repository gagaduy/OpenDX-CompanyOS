// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../shared/testing/assert-integration-environment";
import { createAgenticModule } from "../agentic.module";
import { runAgenticMigrations } from "../infrastructure/database/run-agentic-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("Agentic PostgreSQL admin API", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const verifier = {
    async verify(token: string) {
      const [role, subject = role] = token.split(":");
      return { sub: `staff-${subject}`, name: subject, realm_access: { roles: [role] } };
    },
  };
  const workloadVerifier = {
    async verify() {
      return { sub: "service-account-opendx-agentic-worker", azp: "opendx-agentic-worker" };
    },
  };
  const workflowGateway = {
    async probe() {},
    async start() { return { temporalRunId: "temporal-run-1", duplicate: false }; },
    async signalApproval() {}, async signalCancellation() {},
    async describe() { return { status: "running" as const }; },
  };
  const agentic = createAgenticModule({
    toolAdapters: { resolve: () => { throw new Error("Tool adapters are unavailable in this fixture"); } },
    transactions, staffTokenVerifier: verifier, workloadTokenVerifier: workloadVerifier,
    workflowGateway, generateId: randomUUID, now: () => "2026-08-14T12:00:00.000Z",
    workflowApprovalTtlMs: 3_600_000, dispatcherIntervalMs: 5_000,
    dispatcherBatchSize: 20,
  });
  const app = express();
  app.use(correlationIdMiddleware, express.json());
  app.use("/v1/admin/agentic", agentic.adminRouter);
  app.use("/v1/internal/agentic", agentic.internalRouter);
  app.use(createErrorHandler());

  beforeAll(async () => runAgenticMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await pool.query(`TRUNCATE agentic_provenance_records,agentic_audit_events,agentic_revocations,
      agentic_approval_requests,agentic_budget_entries,agentic_budget_limits,agentic_model_fallbacks,
      agentic_model_configs,agentic_tool_grants,agentic_tools,agentic_policies,
      agentic_subtask_dependencies,agentic_subtasks,agentic_tasks,agentic_configuration_revisions,
      agentic_agents CASCADE`);
    await pool.query(`INSERT INTO agentic_agents(kind,keycloak_client_id) VALUES
      ('ai_ceo','agent-ai-ceo'),('catalog','agent-catalog'),('inventory','agent-inventory'),
      ('order','agent-order'),('finance','agent-finance'),('crm','agent-crm'),('support','agent-support')`);
  });
  afterAll(async () => {
    await runAgenticMigrations(databaseUrl!, "down", 999_999);
    await pool.end();
  });

  it("persists owner-scoped task intake and exposes the fixed workforce", async () => {
    const authorization = { authorization: "Bearer agentic_operator" };
    const created = await request(app).post("/v1/admin/agentic/tasks").set(authorization).send({
      goal: "Review inventory", instructions: "Use evidence",
      provenance: { sourceType: "staff_intake", sourceId: "operator", sourceDigest: "a".repeat(64), classification: "internal" },
      subtasks: [{ agentKind: "inventory", title: "Inspect stock" }], dependencies: [],
    }).expect(201);
    const taskId = created.body.data.task.id as string;
    expect((await pool.query("SELECT source_type,source_id,classification,recorded_by FROM agentic_provenance_records WHERE task_id=$1", [taskId])).rows)
      .toEqual([{ source_type: "staff_intake", source_id: "operator", classification: "internal", recorded_by: "staff-agentic_operator" }]);
    await request(app).get(`/v1/admin/agentic/tasks/${taskId}`).set(authorization).expect(200);
    await request(app).get(`/v1/admin/agentic/tasks/${taskId}`).set("authorization", "Bearer administrator").expect(200);
    await request(app).get("/v1/admin/agentic/tasks").set("authorization", "Bearer agentic_auditor").expect(403);
    const employees = await request(app).get("/v1/admin/agentic/employees").set("authorization", "Bearer agentic_auditor").expect(200);
    expect(employees.body.data).toHaveLength(7);
  });

  it("records denied access without exposing task instructions", async () => {
    const marker = "sensitive-task-body-marker";
    const denied = await request(app).post("/v1/admin/agentic/tasks")
      .set("authorization", "Bearer catalog_manager")
      .send({ instructions: marker }).expect(403);
    expect(JSON.stringify(denied.body)).not.toContain(marker);
    const audit = (await pool.query("SELECT row_to_json(event)::text AS value FROM agentic_audit_events event")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.value).toContain("agentic.task.create.denied");
    expect(audit[0]?.value).not.toContain(marker);
    expect(audit[0]?.value).not.toContain("Bearer catalog_manager");
  });

  it("shows the exact configuration diff and lets the draft owner activate", async () => {
    const children = { policies: [], toolGrants: [], modelConfigurations: [], budgetLimits: [] };
    const created = await request(app).post("/v1/admin/agentic/configuration-revisions")
      .set("authorization", "Bearer agentic_governance_admin:creator").send({ children }).expect(201);
    const revisionId = created.body.data.id as string;
    const diff = await request(app).get(`/v1/admin/agentic/configuration-revisions/${revisionId}/diff`)
      .set("authorization", "Bearer agentic_governance_admin:reviewer").expect(200);
    expect(diff.body.data).toMatchObject({ revisionId, changed: true, candidate: children });
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/activate`)
      .set("authorization", "Bearer agentic_governance_admin:reviewer")
      .send({ expectedVersion: 1 }).expect(403);
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/activate`)
      .set("authorization", "Bearer agentic_governance_admin:creator")
      .send({ expectedVersion: 1 }).expect(200);
    const retired = await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/submit`)
      .set("authorization", "Bearer agentic_governance_admin:creator")
      .send({ expectedVersion: 2 }).expect(400);
    expect(retired.body).toMatchObject({ errorCode: "CONFIGURATION_LIFECYCLE_RETIRED" });
  });

  it("runs the durable staff and workload HTTP control contract idempotently", async () => {
    const governanceCreator = { authorization: "Bearer agentic_governance_admin:creator" };
    const operator = { authorization: "Bearer agentic_operator:operator" };
    const worker = { authorization: "Bearer worker-token" };
    const emptyChildren = { policies: [], toolGrants: [], modelConfigurations: [], budgetLimits: [] };
    const revision = await request(app).post("/v1/admin/agentic/configuration-revisions")
      .set(governanceCreator).send({ children: emptyChildren }).expect(201);
    const revisionId = revision.body.data.id as string;
    const policyId = randomUUID();
    const children = {
      ...emptyChildren,
      policies: [{
        id: policyId,
        revisionId,
        ruleOrder: 1,
        effect: "REQUIRE_APPROVAL",
        actorType: "staff",
        resource: "agentic.workflow",
        action: "complete",
        purpose: "store_health_review",
        dataClassification: "internal",
        reasonCode: "WORKFLOW_ALLOWED",
      }],
    };
    await request(app).patch(`/v1/admin/agentic/configuration-revisions/${revisionId}`)
      .set(governanceCreator).send({ expectedVersion: 1, children }).expect(200);
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/activate`)
      .set(governanceCreator).send({ expectedVersion: 2 }).expect(200);

    const created = await request(app).post("/v1/admin/agentic/tasks")
      .set(operator).send({
        goal: "Review store health",
        instructions: "Use the frozen plan",
        provenance: {
          sourceType: "staff_intake",
          sourceId: "operator",
          sourceDigest: "a".repeat(64),
          classification: "internal",
        },
        subtasks: [{ agentKind: "catalog", title: "Review catalog health" }],
        dependencies: [],
      }).expect(201);
    const taskId = created.body.data.task.id as string;
    const subtaskId = created.body.data.subtasks[0].id as string;
    await request(app).post(`/v1/admin/agentic/tasks/${taskId}/ready`)
      .set(operator).send({ expectedVersion: 1 }).expect(200);

    await request(app).post("/v1/admin/agentic/tasks/not-a-uuid/start")
      .set(operator).send({ expectedVersion: 2, workflowVersion: 1 }).expect(400);
    await request(app).post(`/v1/admin/agentic/tasks/${taskId}/start`)
      .set(operator).send({ expectedVersion: 2, workflowVersion: 1, extra: true }).expect(400);
    const staleStart = await request(app).post(`/v1/admin/agentic/tasks/${taskId}/start`)
      .set(operator).send({ expectedVersion: 1, workflowVersion: 1 }).expect(409);
    expect(JSON.stringify(staleStart.body)).not.toContain("Use the frozen plan");
    expect(JSON.stringify(staleStart.body)).not.toContain("Bearer agentic_operator");

    const started = await request(app).post(`/v1/admin/agentic/tasks/${taskId}/start`)
      .set(operator).send({ expectedVersion: 2, workflowVersion: 1 }).expect(202);
    const runId = started.body.data.id as string;
    await request(app).post(`/v1/admin/agentic/tasks/${taskId}/start`)
      .set(operator).send({ expectedVersion: 2, workflowVersion: 1 }).expect(200);
    await request(app).get(`/v1/admin/agentic/workflow-runs/${runId}`)
      .set("authorization", "Bearer agentic_approver:approver").expect(200);
    const approvals = await request(app).get("/v1/admin/agentic/approvals")
      .set("authorization", "Bearer agentic_approver:approver").expect(200);
    const approvalId = approvals.body.data.items[0].id as string;
    const approvalDecision = {
      expectedVersion: 1,
      decision: "approved",
      reason: "Approved with reviewed evidence",
    };
    await request(app).post(`/v1/admin/agentic/approvals/${approvalId}/decision`)
      .set("authorization", "Bearer agentic_approver:approver")
      .send(approvalDecision).expect(202);
    await request(app).post(`/v1/admin/agentic/approvals/${approvalId}/decision`)
      .set("authorization", "Bearer agentic_approver:approver")
      .send(approvalDecision).expect(200);
    await request(app).post(`/v1/admin/agentic/approvals/${approvalId}/decision`)
      .set("authorization", "Bearer agentic_approver:approver")
      .send({ ...approvalDecision, decision: "rejected" }).expect(409);
    await request(app).get(`/v1/internal/agentic/workflow-runs/${runId}/plan`)
      .set(worker).expect(200);
    await request(app).post(`/v1/internal/agentic/workflow-runs/${runId}/state`)
      .set(worker).send({ projectionSequence: 1, state: "planning" }).expect(200);

    const digest = "b".repeat(64);
    const invocationKey = `${runId}:1:execute_fake_analysis:${subtaskId}:${digest}`;
    await request(app).post("/v1/internal/agentic/activity-invocations/reserve")
      .set(worker).send({
        invocationKey,
        runId,
        activityKind: "execute_fake_analysis",
        branchId: subtaskId,
        inputDigest: digest,
      }).expect(200);
    const completionPath = `/v1/internal/agentic/activity-invocations/${encodeURIComponent(invocationKey)}/complete`;
    const completion = {
      expectedVersion: 1,
      outcomeCode: "FAKE_ANALYSIS_COMPLETED",
      safeResult: { status: "usable" },
    };
    await request(app).post(completionPath).set(worker).send(completion).expect(200);
    await request(app).post(completionPath).set(worker).send(completion).expect(200);
    await request(app).post(completionPath).set(worker).send({
      ...completion,
      outcomeCode: "DIFFERENT_OUTCOME",
    }).expect(409);
    await request(app).post("/v1/internal/agentic/activity-invocations/reserve")
      .set(worker).send({
        invocationKey: "invalid",
        runId,
        activityKind: "execute_fake_analysis",
        inputDigest: "not-a-digest",
      }).expect(400);

    const cancellation = { expectedVersion: 3, reasonCode: "CANCELED_BY_OPERATOR" };
    await request(app).post(`/v1/admin/agentic/workflow-runs/${runId}/cancel`)
      .set(operator).send(cancellation).expect(202);
    await request(app).post(`/v1/admin/agentic/workflow-runs/${runId}/cancel`)
      .set(operator).send(cancellation).expect(200);
    expect((await pool.query(
      "SELECT count(*)::text AS count FROM agentic_workflow_runs WHERE task_id=$1",
      [taskId],
    )).rows[0]?.count).toBe("1");
  });

  it("authorizes and atomically settles digest-only internal model runs", async () => {
    const worker = { authorization: "Bearer worker-token" };
    const revisionId = randomUUID();
    const taskId = randomUUID();
    const provenanceId = randomUUID();
    const alternateProvenanceId = randomUUID();
    const primaryModel = "google/gemma-4-26b-a4b-it:free";
    const fallbackModel = "liquid/lfm-2.5-2.6b:free";
    await pool.query(
      `INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest)
       VALUES($1,'draft','creator',$2)`,
      [revisionId, "1".repeat(64)],
    );
    await pool.query(
      `INSERT INTO agentic_model_configs
       (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
        max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
       VALUES($1,'catalog',$2,1000,500,5000,1,2000,4000)`,
      [revisionId, primaryModel],
    );
    await pool.query(
      `INSERT INTO agentic_model_fallbacks(revision_id,agent_kind,position,model)
       VALUES($1,'catalog',1,$2)`,
      [revisionId, fallbackModel],
    );
    await pool.query(
      `INSERT INTO agentic_budget_limits
       (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
       VALUES($1,'catalog',100,1000,10000)`,
      [revisionId],
    );
    await pool.query(
      `INSERT INTO agentic_policies
       (id,revision_id,rule_order,effect,actor_type,agent_kind,resource,action,purpose,
        data_classification,reason_code)
       VALUES($1,$2,1,'ALLOW','agent','catalog','model','execute','department_analysis',
        'internal','MODEL_EXECUTION_ALLOWED')`,
      [randomUUID(), revisionId],
    );
    await pool.query(
      `UPDATE agentic_configuration_revisions SET state='active',decided_by='reviewer',
       decided_at=$2,version=4,updated_at=$2 WHERE id=$1`,
      [revisionId, "2026-08-20T03:00:00.000Z"],
    );
    await pool.query(
      `INSERT INTO agentic_tasks
       (id,state,created_by,goal,instructions,configuration_revision_id,version)
       VALUES($1,'ready','operator','Review catalog','sensitive prompt body',$2,2)`,
      [taskId, revisionId],
    );
    await pool.query(
      `INSERT INTO agentic_subtasks(id,task_id,agent_kind,title)
       VALUES($1,$2,'catalog','Review catalog health')`,
      [randomUUID(), taskId],
    );
    await pool.query(
      `INSERT INTO agentic_provenance_records
       (id,task_id,source_type,source_id,source_digest,classification,recorded_by)
       VALUES($1,$2,'tool_result','catalog.health',$3,'internal','agent-catalog')`,
      [provenanceId, taskId, "2".repeat(64)],
    );
    await pool.query(
      `INSERT INTO agentic_provenance_records
       (id,task_id,source_type,source_id,source_digest,classification,recorded_by)
       VALUES($1,$2,'tool_result','catalog.risk',$3,'internal','agent-catalog')`,
      [alternateProvenanceId, taskId, "3".repeat(64)],
    );

    const reserveBody = {
      taskId,
      agentKind: "catalog",
      generationRound: 0,
      idempotencyKey: "catalog-round-0",
      inputDigest: "a".repeat(64),
      primaryModel,
      fallbackModel,
    };
    await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .send(reserveBody).expect(401);
    const reserved = await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send(reserveBody).expect(200);
    const runId = reserved.body.data.runId as string;
    expect(reserved.body.data).toMatchObject({
      primaryModel, fallbackModel, maxReservedCostMicros: 4, version: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const delayedReserve = await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send(reserveBody).expect(200);
    expect(delayedReserve.body.data).toEqual(reserved.body.data);
    const startBody = { expectedVersion: 1, returnedModel: primaryModel, fallbackPosition: 0 };
    const concurrentStarts = await Promise.all([
      request(app).post(`/v1/internal/agentic/model-runs/${runId}/start`).set(worker).send(startBody),
      request(app).post(`/v1/internal/agentic/model-runs/${runId}/start`).set(worker).send(startBody),
    ]);
    expect(concurrentStarts.map(({ status }) => status)).toEqual([200, 200]);
    const runningReserveReplay = await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send(reserveBody).expect(200);
    expect(runningReserveReplay.body.data).toEqual(reserved.body.data);
    await request(app).post(`/v1/internal/agentic/model-runs/${runId}/start`)
      .set(worker).send({ ...startBody, expectedVersion: runningReserveReplay.body.data.version })
      .expect(200);
    await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send({ ...reserveBody, inputDigest: "8".repeat(64) }).expect(409);

    const startRaceReserve = await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send({
        ...reserveBody,
        idempotencyKey: "catalog-round-0-start-race",
        inputDigest: "9".repeat(64),
      }).expect(200);
    const startRaceRunId = startRaceReserve.body.data.runId as string;
    const changedStarts = await Promise.all([
      request(app).post(`/v1/internal/agentic/model-runs/${startRaceRunId}/start`)
        .set(worker).send(startBody),
      request(app).post(`/v1/internal/agentic/model-runs/${startRaceRunId}/start`)
        .set(worker).send({ expectedVersion: 1, returnedModel: fallbackModel, fallbackPosition: 1 }),
    ]);
    expect(changedStarts.map(({ status }) => status).sort()).toEqual([200, 409]);

    const completeBody = {
      expectedVersion: 2,
      idempotencyKey: "catalog-round-0-terminal",
      status: "completed",
      outputDigest: "b".repeat(64),
      inputTokens: 500,
      outputTokens: 250,
      providerRequestIdDigest: "c".repeat(64),
      latencyMs: 20,
      statusCode: "QUALITY_ACCEPTED",
      qualityOutcome: "accepted",
      qualityReasonCodes: ["EVIDENCE_VALID"],
      provenanceIds: [provenanceId],
      evidenceDigest: "d".repeat(64),
    };
    const concurrentCompletions = await Promise.all([
      request(app).post(`/v1/internal/agentic/model-runs/${runId}/complete`)
        .set(worker).send(completeBody),
      request(app).post(`/v1/internal/agentic/model-runs/${runId}/complete`)
        .set(worker).send(completeBody),
    ]);
    expect(concurrentCompletions.map(({ status }) => status)).toEqual([200, 200]);
    await request(app).post(`/v1/internal/agentic/model-runs/${runId}/complete`)
      .set(worker).send(completeBody).expect(200);
    const terminalReserveReplay = await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send(reserveBody).expect(200);
    expect(terminalReserveReplay.body.data).toEqual(reserved.body.data);
    const terminalStartReplay = await request(app)
      .post(`/v1/internal/agentic/model-runs/${runId}/start`)
      .set(worker)
      .send({ ...startBody, expectedVersion: terminalReserveReplay.body.data.version })
      .expect(200);
    expect(terminalStartReplay.body.data).toMatchObject({ status: "completed", version: 3 });
    await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send({ ...reserveBody, inputDigest: "7".repeat(64) }).expect(409);
    const conflict = await request(app).post(`/v1/internal/agentic/model-runs/${runId}/complete`)
      .set(worker).send({ ...completeBody, evidenceDigest: "e".repeat(64) }).expect(409);
    expect(JSON.stringify(conflict.body)).not.toContain("sensitive prompt body");

    const conflictingReserve = await request(app).post("/v1/internal/agentic/model-runs/reserve")
      .set(worker).send({
        ...reserveBody,
        generationRound: 1,
        idempotencyKey: "catalog-round-1",
        inputDigest: "e".repeat(64),
      }).expect(200);
    const conflictingRunId = conflictingReserve.body.data.runId as string;
    await request(app).post(`/v1/internal/agentic/model-runs/${conflictingRunId}/start`)
      .set(worker).send(startBody).expect(200);
    const roundOneCompletion = {
      ...completeBody,
      idempotencyKey: "catalog-round-1-terminal",
    };
    const changedEvidenceCompletion = {
      ...roundOneCompletion,
      evidenceDigest: "f".repeat(64),
      qualityReasonCodes: ["ARITHMETIC_MISMATCH"],
      provenanceIds: [alternateProvenanceId],
    };
    const conflictingCompletions = await Promise.all([
      request(app).post(`/v1/internal/agentic/model-runs/${conflictingRunId}/complete`)
        .set(worker).send(roundOneCompletion),
      request(app).post(`/v1/internal/agentic/model-runs/${conflictingRunId}/complete`)
        .set(worker).send(changedEvidenceCompletion),
    ]);
    expect(conflictingCompletions.map(({ status }) => status).sort()).toEqual([200, 409]);

    expect((await pool.query(
      `SELECT status,settled_cost_micros::text,version FROM agentic_model_runs WHERE id=$1`,
      [runId],
    )).rows).toEqual([{ status: "completed", settled_cost_micros: "2", version: 3 }]);
    expect((await pool.query(
      `SELECT entry_type,cost_micros::text FROM agentic_budget_entries
       WHERE model_run_id=$1 ORDER BY entry_type`,
      [runId],
    )).rows).toEqual([
      { entry_type: "reservation", cost_micros: "4" },
      { entry_type: "settlement", cost_micros: "2" },
    ]);
    expect((await pool.query(
      "SELECT count(*)::text AS count FROM agentic_model_quality_evidence WHERE model_run_id=$1",
      [runId],
    )).rows[0]?.count).toBe("1");
    const durableText = JSON.stringify((await pool.query(
      `SELECT action,parameters_digest,result_digest,error_code FROM agentic_audit_events
       WHERE resource_id=$1 ORDER BY occurred_at,id`,
      [runId],
    )).rows);
    expect(durableText).not.toContain("sensitive prompt body");
    expect(durableText).not.toContain("Bearer worker-token");
  });

  it("rolls back rejected model runs and durably records safe denial evidence", async () => {
    const worker = { authorization: "Bearer worker-token" };
    const revisionId = randomUUID();
    const fallbackModel = "liquid/lfm-2.5-2.6b:free";
    const primaryModels = {
      catalog: "google/gemma-4-26b-a4b-it:free",
      order: "nvidia/nemotron-3-super-120b-a12b:free",
      inventory: "nvidia/nemotron-3-super-120b-a12b:free",
    } as const;
    await pool.query(
      `INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest)
       VALUES($1,'draft','creator',$2)`,
      [revisionId, "4".repeat(64)],
    );
    for (const [agentKind, primaryModel] of Object.entries(primaryModels)) {
      await pool.query(
        `INSERT INTO agentic_model_configs
         (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
          max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
         VALUES($1,$2,$3,1000,500,5000,1,2000,4000)`,
        [revisionId, agentKind, primaryModel],
      );
      await pool.query(
        `INSERT INTO agentic_model_fallbacks(revision_id,agent_kind,position,model)
         VALUES($1,$2,1,$3)`,
        [revisionId, agentKind, fallbackModel],
      );
      await pool.query(
        `INSERT INTO agentic_budget_limits
         (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
         VALUES($1,$2,$3,1000,10000)`,
        [revisionId, agentKind, agentKind === "inventory" ? 1 : 100],
      );
    }
    for (const agentKind of ["catalog", "inventory"] as const) {
      await pool.query(
        `INSERT INTO agentic_policies
         (id,revision_id,rule_order,effect,actor_type,agent_kind,resource,action,purpose,
          data_classification,reason_code)
         VALUES($1,$2,$3,'ALLOW','agent',$4,'model','execute','department_analysis',
          'internal','MODEL_EXECUTION_ALLOWED')`,
        [randomUUID(), revisionId, agentKind === "catalog" ? 1 : 2, agentKind],
      );
    }
    await pool.query(
      `UPDATE agentic_configuration_revisions SET state='active',decided_by='reviewer',
       decided_at=$2,version=4,updated_at=$2 WHERE id=$1`,
      [revisionId, "2026-08-20T03:00:00.000Z"],
    );
    const taskIds = {
      catalog: randomUUID(),
      order: randomUUID(),
      inventory: randomUUID(),
    } as const;
    for (const [agentKind, taskId] of Object.entries(taskIds)) {
      await pool.query(
        `INSERT INTO agentic_tasks
         (id,state,created_by,goal,instructions,configuration_revision_id,version)
         VALUES($1,'ready','operator','Review model denial','sensitive denied prompt',$2,2)`,
        [taskId, revisionId],
      );
      await pool.query(
        `INSERT INTO agentic_subtasks(id,task_id,agent_kind,title)
         VALUES($1,$2,$3,'Review assigned department')`,
        [randomUUID(), taskId, agentKind],
      );
    }
    const reserve = (agentKind: keyof typeof primaryModels, idempotencyKey: string) => ({
      taskId: taskIds[agentKind],
      agentKind,
      generationRound: 0,
      idempotencyKey,
      inputDigest: "a".repeat(64),
      primaryModel: primaryModels[agentKind],
      fallbackModel,
    });

    await request(app).post("/v1/internal/agentic/model-runs/reserve").set(worker)
      .send({ ...reserve("catalog", "denied-validation"), fallbackModel: primaryModels.catalog })
      .expect(400);
    await request(app).post("/v1/internal/agentic/model-runs/reserve").set(worker)
      .send(reserve("order", "denied-policy")).expect(403);
    await pool.query(
      `INSERT INTO agentic_revocations
       (id,target_type,target_id,reason,activated_by,activated_at,idempotency_key)
       VALUES($1,'model',$2,'Emergency model stop','reviewer',$3,'revoke-catalog-model')`,
      [randomUUID(), primaryModels.catalog, "2026-08-20T03:00:00.000Z"],
    );
    await request(app).post("/v1/internal/agentic/model-runs/reserve").set(worker)
      .send(reserve("catalog", "denied-revocation")).expect(403);
    await request(app).post("/v1/internal/agentic/model-runs/reserve").set(worker)
      .send(reserve("inventory", "denied-budget")).expect(400);

    expect((await pool.query("SELECT count(*)::text AS count FROM agentic_model_runs")).rows[0]?.count)
      .toBe("0");
    expect((await pool.query("SELECT count(*)::text AS count FROM agentic_budget_entries")).rows[0]?.count)
      .toBe("0");
    const audits = (await pool.query(
      `SELECT action,outcome,error_code,task_id::text,parameters_digest
       FROM agentic_audit_events WHERE action='model_run.reserve.denied'
       ORDER BY error_code`,
    )).rows;
    expect(audits).toHaveLength(4);
    expect(audits.map(({ error_code }) => error_code)).toEqual([
      "BUDGET_EXCEEDED",
      "MODEL_CONFIGURATION_MISMATCH",
      "MODEL_EXECUTION_REVOKED",
      "MODEL_POLICY_DENIED",
    ]);
    expect(audits.every(({ outcome, parameters_digest }) =>
      outcome === "denied" && parameters_digest === "a".repeat(64))).toBe(true);
    const durableText = JSON.stringify(audits);
    expect(durableText).not.toContain("sensitive denied prompt");
    expect(durableText).not.toContain("Bearer worker-token");
    expect(durableText).not.toContain(primaryModels.catalog);

    await pool.query(`
      CREATE FUNCTION agentic_test_reject_denial_audit() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF NEW.action='model_run.reserve.denied' THEN
          RAISE EXCEPTION 'audit database secret marker';
        END IF;
        RETURN NEW;
      END; $f$;
      CREATE TRIGGER agentic_test_reject_denial_audit
        BEFORE INSERT ON agentic_audit_events FOR EACH ROW
        EXECUTE FUNCTION agentic_test_reject_denial_audit();
    `);
    try {
      const unavailable = await request(app).post("/v1/internal/agentic/model-runs/reserve")
        .set(worker).send(reserve("order", "denied-audit-unavailable")).expect(503);
      expect(unavailable.body).toMatchObject({
        errorCode: "AUDIT_UNAVAILABLE",
        message: "Audit evidence is unavailable",
      });
      expect(JSON.stringify(unavailable.body)).not.toContain("audit database secret marker");
      expect((await pool.query("SELECT count(*)::text AS count FROM agentic_model_runs")).rows[0]?.count)
        .toBe("0");
      expect((await pool.query("SELECT count(*)::text AS count FROM agentic_budget_entries")).rows[0]?.count)
        .toBe("0");
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS agentic_test_reject_denial_audit ON agentic_audit_events;
        DROP FUNCTION IF EXISTS agentic_test_reject_denial_audit();
      `);
    }
  });
});
