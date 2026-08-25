// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../shared/testing/assert-integration-environment";
import { createAgenticModule } from "../agentic.module";
import { runAgenticMigrations } from "../infrastructure/database/run-agentic-migrations";
import { STORE_HEALTH_EXECUTION_CATALOG } from "../application/orchestration/store-health-execution-catalog";
import { canonicalDigest } from "../domain/entities/orchestration-execution-descriptor";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("Agentic PostgreSQL admin API", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const verifier = {
    async verify(token: string) {
      if (token === "ai-ceo-token") {
        return { sub: "service-account-agent-ai-ceo", azp: "agent-ai-ceo", realm_access: { roles: [] } };
      }
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
  const privateFiles = new Map<string, Buffer>();
  const agentic = createAgenticModule({
    toolAdapters: { resolve: () => { throw new Error("Tool adapters are unavailable in this fixture"); } },
    transactions, staffTokenVerifier: verifier, workloadTokenVerifier: workloadVerifier,
    workflowGateway, generateId: randomUUID, now: () => "2026-08-14T12:00:00.000Z",
    workflowApprovalTtlMs: 3_600_000, dispatcherIntervalMs: 5_000,
    dispatcherBatchSize: 20,
    agenticFileStorage: {
      async put(key, content) { privateFiles.set(key, Buffer.from(content)); },
      async open(key) { return Readable.from(privateFiles.get(key) ?? Buffer.alloc(0)); },
      async delete(key) { privateFiles.delete(key); },
    },
    agenticFileScanner: { async scan() { return { status: "clean" as const }; } },
    agenticFileParser: {
      parse(_format, bytes) {
        const rows = Buffer.from(bytes).toString("utf8").trim().split(/\r?\n/);
        return { rowCount: rows.length, columnCount: Math.max(...rows.map((row) => row.split(",").length)), samples: rows.slice(0, 10) };
      },
    },
  });
  const app = express();
  app.use(correlationIdMiddleware, express.json());
  app.use("/v1/admin/agentic", agentic.adminRouter);
  app.use("/v1/internal/agentic", agentic.internalRouter);
  app.use(createErrorHandler());

  beforeAll(async () => runAgenticMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    privateFiles.clear();
    await pool.query(`TRUNCATE agentic_staff_intake_idempotency,
      agentic_file_approvals,agentic_file_previews,agentic_intake_files,
      agentic_provenance_records,agentic_audit_events,agentic_revocations,
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
    const inventory = await request(app).get("/v1/admin/agentic/employees/inventory").set("authorization", "Bearer agentic_auditor").expect(200);
    expect(inventory.body.data).toMatchObject({ kind: "inventory", department: "Inventory", governance: { active: false, revoked: false, configurationVersion: 0 }, executionHealth: { state: "unknown", basis: "no_active_configuration" } });
    expect(JSON.stringify(inventory.body.data)).not.toMatch(/keycloak|secret|credential|clientSecret|prompt/i);
  });

  it("creates and exactly replays guided staff task intake with role-scoped reads", async () => {
    const operator = { authorization: "Bearer agentic_operator:operator-a", "idempotency-key": "console:task:1" };
    const body = { mode: "store_health_review", goal: "Review Store Health", instructions: "Use approved aggregate evidence only.", reviewWindow: { start: "2026-08-08", end: "2026-08-14" } };
    const created = await request(app).post("/v1/admin/agentic/tasks/intake").set(operator).send(body).expect(201);
    const replayed = await request(app).post("/v1/admin/agentic/tasks/intake").set(operator).send(body).expect(200);
    expect(replayed.body.data.task.id).toBe(created.body.data.task.id);
    expect(created.body.data).toMatchObject({ subtasks: [{ agentKind: "ai_ceo", title: "Coordinate Store Health Review" }], dependencies: [] });
    expect((await pool.query("SELECT count(*)::text count FROM agentic_tasks")).rows[0]?.count).toBe("1");
    expect((await pool.query("SELECT count(*)::text count FROM agentic_provenance_records")).rows[0]?.count).toBe("1");

    const changed = await request(app).post("/v1/admin/agentic/tasks/intake").set(operator).send({ ...body, goal: "Changed" }).expect(409);
    expect(changed.body.errorCode).toBe("IDEMPOTENCY_CONFLICT");
    const owned = await request(app).get("/v1/admin/agentic/tasks?state=draft&page=1&pageSize=25").set("authorization", "Bearer agentic_operator:operator-a").expect(200);
    expect(owned.body.data).toMatchObject({ totalItems: 1 });
    const other = await request(app).get("/v1/admin/agentic/tasks").set("authorization", "Bearer agentic_operator:operator-b").expect(200);
    expect(other.body.data).toMatchObject({ totalItems: 0 });
    const overview = await request(app).get("/v1/admin/agentic/tasks/overview").set("authorization", "Bearer agentic_operator:operator-a").expect(200);
    expect(overview.body.data).toMatchObject({ counts: { waiting: 1 }, pendingApprovals: 0, settledCostMicros: 0 });
    const operations = await request(app).get(`/v1/admin/agentic/tasks/${created.body.data.task.id}/operations`)
      .set("authorization", "Bearer agentic_operator:operator-a").expect(200);
    expect(operations.body.data).toMatchObject({ task: { id: created.body.data.task.id }, timeline: [{ kind: "agentic_task.intake", state: "allowed" }], branches: [], costs: { reservedMicros: 0, settledMicros: 0 } });
    expect(operations.body.data.task).not.toHaveProperty("instructions");
    await request(app).get(`/v1/admin/agentic/tasks/${created.body.data.task.id}/operations`)
      .set("authorization", "Bearer agentic_operator:operator-b").expect(404);

    await request(app).get("/v1/admin/agentic/tasks/overview").set("authorization", "Bearer agentic_approver").expect(200);
    await request(app).get("/v1/admin/agentic/tasks/overview").set("authorization", "Bearer agentic_governance_admin").expect(200);
    await request(app).post("/v1/admin/agentic/tasks/intake").set("authorization", "Bearer agentic_approver").send(body).expect(403);
    await request(app).get("/v1/admin/agentic/tasks").set("authorization", "Bearer agentic_auditor").expect(403);
    await request(app).get("/v1/admin/agentic/tasks/overview?extra=true").set("authorization", "Bearer agentic_operator").expect(400);
    await request(app).post("/v1/admin/agentic/tasks/intake").set("authorization", "Bearer agentic_operator").send(body).expect(400);
    await request(app).post("/v1/admin/agentic/tasks/intake").set(operator).send({ ...body, departmentDag: [] }).expect(400);
  });

  it("exactly replays a staff file upload with one record and one audit event", async () => {
    const authorization = "Bearer agentic_governance_admin:governance-a";
    const upload = () => request(app).post("/v1/admin/agentic/files")
      .set("authorization", authorization)
      .set("idempotency-key", "console:file:integration-1")
      .attach("file", Buffer.from("sku,stock\nA,1\n"), { filename: "health.csv", contentType: "text/csv" });

    const created = await upload().expect(201);
    const replayed = await upload().expect(200);

    expect(replayed.body.data.id).toBe(created.body.data.id);
    expect((await pool.query("SELECT count(*)::text count FROM agentic_intake_files")).rows[0]?.count).toBe("1");
    expect((await pool.query("SELECT count(*)::text count FROM agentic_audit_events WHERE action='agentic_file.upload'")).rows[0]?.count).toBe("1");
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
    expect((await pool.query(
      "SELECT configuration_revision_id FROM agentic_tasks WHERE id=$1",
      [taskId],
    )).rows[0]?.configuration_revision_id).toBe(revisionId);

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
    const successor = await request(app).post("/v1/admin/agentic/configuration-revisions")
      .set(governanceCreator).send({ children: emptyChildren }).expect(201);
    const successorId = successor.body.data.id as string;
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${successorId}/activate`)
      .set(governanceCreator).send({ expectedVersion: 1 }).expect(200);
    expect((await pool.query(
      "SELECT configuration_revision_id FROM agentic_tasks WHERE id=$1",
      [taskId],
    )).rows[0]?.configuration_revision_id).toBe(revisionId);
    await request(app).get(`/v1/admin/agentic/workflow-runs/${runId}`)
      .set("authorization", "Bearer agentic_approver:approver").expect(200);
    const approvals = await request(app).get("/v1/admin/agentic/approvals")
      .set("authorization", "Bearer agentic_approver:approver").expect(200);
    const approvalId = approvals.body.data.items[0].id as string;
    const detailBeforeDecision = await request(app).get(`/v1/admin/agentic/approvals/${approvalId}/detail`)
      .set("authorization", "Bearer agentic_approver:approver").expect(200);
    expect(detailBeforeDecision.body.data).toMatchObject({ approval: { id: approvalId }, risk: { level: "high" } });
    expect(detailBeforeDecision.body.data).not.toHaveProperty("payloadDigest");
    await request(app).get(`/v1/admin/agentic/approvals/${approvalId}/detail`)
      .set(operator).expect(200);
    await request(app).get(`/v1/admin/agentic/approvals/${approvalId}/detail`)
      .set("authorization", "Bearer agentic_governance_admin:reviewer").expect(200);
    await request(app).get(`/v1/admin/agentic/approvals/${approvalId}/detail`)
      .set("authorization", "Bearer agentic_auditor:auditor").expect(403);
    const approvalDecision = {
      expectedVersion: 1,
      decision: "approved",
      reason: "Approved with reviewed evidence",
    };
    await request(app).post(`/v1/admin/agentic/approvals/${approvalId}/decision`)
      .set("authorization", "Bearer agentic_approver:approver")
      .send(approvalDecision).expect(202);
    const detailAfterDecision = await request(app).get(`/v1/admin/agentic/approvals/${approvalId}/detail`)
      .set("authorization", "Bearer agentic_approver:approver").expect(200);
    expect(detailAfterDecision.body.data.payloadDigest).toBe(detailAfterDecision.body.data.approval.parametersDigest);
    expect((await pool.query("SELECT count(*)::text count FROM agentic_workflow_signal_receipts WHERE approval_id=$1", [approvalId])).rows[0]?.count).toBe("1");
    await request(app).post(`/v1/admin/agentic/approvals/${approvalId}/decision`)
      .set("authorization", "Bearer agentic_approver:approver")
      .send(approvalDecision).expect(200);
    await request(app).post(`/v1/admin/agentic/approvals/${approvalId}/decision`)
      .set("authorization", "Bearer agentic_approver:approver")
      .send({ ...approvalDecision, decision: "rejected" }).expect(409);
    const frozenPlan = await request(app).get(`/v1/internal/agentic/workflow-runs/${runId}/plan`)
      .set(worker).expect(200);
    expect(frozenPlan.body.data.configurationRevisionId).toBe(revisionId);
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

  it("prepares, reads, and settles descriptor-bound orchestration without echoing private bodies", async () => {
    const at = "2026-08-14T12:00:00.000Z";
    const revisionId = randomUUID();
    const taskId = randomUUID();
    await pool.query(`INSERT INTO agentic_configuration_revisions
      (id,state,created_by,payload_digest,version,created_at,updated_at)
      VALUES($1,'draft','governance-admin',$2,4,$3,$3)`, [revisionId, "1".repeat(64), at]);
    const entries = STORE_HEALTH_EXECUTION_CATALOG.filter(({ agentKind }) =>
      agentKind === "catalog" || agentKind === "inventory");
    let ruleOrder = 1;
    await pool.query(`INSERT INTO agentic_model_configs
      (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,max_retries,
       input_cost_micros_per_million,output_cost_micros_per_million)
      VALUES($1,'ai_ceo','ai-ceo/primary',1000,500,30000,1,1,1)`, [revisionId]);
    await pool.query(`INSERT INTO agentic_model_fallbacks(revision_id,agent_kind,position,model)
      VALUES($1,'ai_ceo',1,'ai-ceo/fallback')`, [revisionId]);
    await pool.query(`INSERT INTO agentic_budget_limits
      (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
      VALUES($1,'ai_ceo',20000,200000,2000000)`, [revisionId]);
    for (const entry of entries) {
      await pool.query(`INSERT INTO agentic_model_configs
        (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,max_retries,
         input_cost_micros_per_million,output_cost_micros_per_million)
        VALUES($1,$2,$3,1000,500,30000,1,1,1)`, [revisionId, entry.agentKind, `${entry.agentKind}/primary`]);
      await pool.query(`INSERT INTO agentic_model_fallbacks(revision_id,agent_kind,position,model)
        VALUES($1,$2,1,$3)`, [revisionId, entry.agentKind, `${entry.agentKind}/fallback`]);
      await pool.query(`INSERT INTO agentic_budget_limits
        (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
        VALUES($1,$2,10000,100000,1000000)`, [revisionId, entry.agentKind]);
      await pool.query(`INSERT INTO agentic_policies
        (id,revision_id,rule_order,effect,actor_type,agent_kind,department,resource,action,purpose,
         data_classification,reason_code)
        VALUES($1,$2,$3,'ALLOW','agent','ai_ceo',$4,'agentic_orchestration_plan','assign',
          'store_health_review','internal','ASSIGNMENT_ALLOWED')`,
      [randomUUID(), revisionId, ruleOrder++, entry.agentKind]);
      for (const grant of entry.toolGrants) {
        await pool.query(`INSERT INTO agentic_tools
          (name,version,input_schema_digest,output_schema_digest,active,execution_cost_micros,maximum_attempts)
          VALUES($1,1,$2,$3,true,1,2) ON CONFLICT(name,version) DO NOTHING`,
        [grant.name, "2".repeat(64), "3".repeat(64)]);
        await pool.query(`INSERT INTO agentic_tool_grants
          (id,revision_id,agent_kind,tool_name,tool_version,purpose,data_scope,max_invocations)
          VALUES($1,$2,$3,$4,1,$5,$6,$7)`,
        [randomUUID(), revisionId, entry.agentKind, grant.name, grant.purpose,
          grant.dataScope, grant.maximumInvocations]);
        await pool.query(`INSERT INTO agentic_policies
          (id,revision_id,rule_order,effect,actor_type,agent_kind,department,resource,action,purpose,
           data_classification,reason_code)
          VALUES($1,$2,$3,'ALLOW','agent',$4,$4,$5,'invoke',$6,$7,'TOOL_ALLOWED')`,
        [randomUUID(), revisionId, ruleOrder++, entry.agentKind, grant.name,
          grant.purpose, grant.dataClassification]);
      }
    }
    await pool.query(`INSERT INTO agentic_policies
      (id,revision_id,rule_order,effect,actor_type,agent_kind,department,resource,action,purpose,
       data_classification,reason_code)
      VALUES($1,$2,$3,'ALLOW','agent','catalog','inventory','agentic_collaboration','request',
        'compare_availability','internal','COLLABORATION_ALLOWED')`, [randomUUID(), revisionId, ruleOrder]);
    ruleOrder += 1;
    for (const agentKind of ["catalog", "inventory"] as const) {
      await pool.query(`INSERT INTO agentic_policies
        (id,revision_id,rule_order,effect,actor_type,agent_kind,department,resource,action,purpose,
         data_classification,reason_code)
        VALUES($1,$2,$3,'ALLOW','agent',$4,'ai_ceo','agentic_orchestration_result','share',
          'executive_synthesis','internal','RESULT_SHARE_ALLOWED')`,
      [randomUUID(), revisionId, ruleOrder++, agentKind]);
    }
    await pool.query(`INSERT INTO agentic_policies
      (id,revision_id,rule_order,effect,actor_type,agent_kind,resource,action,purpose,
       data_classification,reason_code)
      VALUES($1,$2,$3,'ALLOW','agent','ai_ceo','agentic_executive_report','share',
        'store_health_review','internal','REPORT_SHARE_ALLOWED')`, [randomUUID(), revisionId, ruleOrder++]);
    for (const agentKind of ["ai_ceo", "catalog", "inventory"] as const) {
      await pool.query(`INSERT INTO agentic_policies
        (id,revision_id,rule_order,effect,actor_type,agent_kind,resource,action,purpose,
         data_classification,reason_code)
        VALUES($1,$2,$3,'ALLOW','agent',$4,'model','execute','department_analysis',
          'internal','MODEL_EXECUTION_ALLOWED')`, [randomUUID(), revisionId, ruleOrder++, agentKind]);
    }
    await pool.query(`UPDATE agentic_configuration_revisions SET state='active',decided_by='governance-admin',decided_at=$2
      WHERE id=$1`, [revisionId, at]);
    await pool.query(`INSERT INTO agentic_tasks
      (id,state,created_by,goal,instructions,configuration_revision_id,version,created_at,updated_at)
      VALUES($1,'ready','operator','Review Store Health','private task instructions',$2,2,$3,$3)`,
    [taskId, revisionId, at]);
    await pool.query(`INSERT INTO agentic_provenance_records
      (id,task_id,source_type,source_id,source_digest,classification,recorded_by,recorded_at)
      VALUES($1,$2,'staff_intake','operator',$3,'internal','operator',$4)`,
    [randomUUID(), taskId, "4".repeat(64), at]);

    const worker = { authorization: "Bearer worker-token" };
    const prepareAtomicSettlement = async (
      agentKind: "ai_ceo" | "catalog", status: "completed" | "partial",
      outputDigest: string, evidenceDigest: string, provenanceIds: string[], key: string,
      inputDigest: string, resultSchemaName: string, resultSchemaDigest: string,
    ) => {
      const reservation = await request(app).post("/v1/internal/agentic/model-runs/reserve")
        .set(worker).send({ taskId, agentKind, generationRound: 0,
          idempotencyKey: key, inputDigest,
          resultSchemaName, resultSchemaDigest,
          primaryModel: agentKind === "ai_ceo" ? "ai-ceo/primary" : `${agentKind}/primary`,
          fallbackModel: agentKind === "ai_ceo" ? "ai-ceo/fallback" : `${agentKind}/fallback` });
      if (reservation.status !== 200) {
        throw new Error(`Atomic model reservation failed: ${JSON.stringify(reservation.body)}`);
      }
      await request(app).post(`/v1/internal/agentic/model-runs/${reservation.body.data.runId}/start`)
        .set(worker).send({ expectedVersion: 1,
          returnedModel: agentKind === "ai_ceo" ? "ai-ceo/primary" : `${agentKind}/primary`,
          fallbackPosition: 0 }).expect(200);
      return { runId: reservation.body.data.runId, expectedVersion: 2,
        idempotencyKey: `${key}:complete`, status, outputDigest,
        inputTokens: 10, outputTokens: 10, providerRequestIdDigest: "5".repeat(64),
        latencyMs: 1, statusCode: status === "completed" ? "MODEL_COMPLETED" : "MODEL_PARTIAL",
        qualityOutcome: status === "completed" ? "accepted" : "partial",
        qualityReasonCodes: status === "completed" ? [] : ["PARTIAL_EVIDENCE"],
        provenanceIds, evidenceDigest };
    };
    const briefResponse = await request(app).get(`/v1/internal/agentic/orchestration/task-briefs/${taskId}`)
      .set(worker).expect("cache-control", "no-store").expect(200);
    const brief = briefResponse.body.data;
    expect(brief.eligibleAssignments.map((value: { agentKind: string }) => value.agentKind))
      .toEqual(["catalog", "inventory"]);
    const planningAuthorityResponse = await request(app)
      .get(`/v1/internal/agentic/orchestration/ai-ceo-authorities/${brief.planningAuthority.authorityId}`)
      .set(worker).set("x-opendx-authority-digest", brief.planningAuthority.authorityDigest)
      .expect("cache-control", "no-store").expect(200);
    const subtaskIds = [randomUUID(), randomUUID()];
    const subtasks = entries.map((entry, index) => {
      const assignment = brief.eligibleAssignments.find(
        (value: { agentKind: string }) => value.agentKind === entry.agentKind,
      );
      return { id: subtaskIds[index], owner: entry.agentKind,
      expectedResultSchemaDigest: entry.resultSchemaDigest, allowedToolsDigest: entry.allowedToolsDigest,
      dataScope: assignment.dataScope, freshnessSeconds: assignment.freshnessSeconds,
      timeoutSeconds: assignment.timeoutSeconds, budgetMicros: assignment.budgetMicros,
      sourceProvenanceDigest: canonicalDigest(brief.provenance),
      dependencies: index === 0 ? [] : [subtaskIds[0]] };
    });
    const planModelSettlement = await prepareAtomicSettlement(
      "ai_ceo", "completed", canonicalDigest({ schemaVersion: 1,
        subtasks: [{ owner: "catalog", dependencies: [] },
          { owner: "inventory", dependencies: ["catalog"] }] }), "a".repeat(64),
      brief.provenance.map((value: { id: string }) => value.id), `planning:${taskId}`,
      planningAuthorityResponse.body.data.authority.authorizedContextDigest,
      planningAuthorityResponse.body.data.authority.resultSchemaName,
      planningAuthorityResponse.body.data.authority.resultSchemaDigest,
    );
    const plan = { id: randomUUID(), taskId, version: 1, digest: "5".repeat(64),
      taskBriefDigest: brief.digest, policyVersion: 4, configurationRevisionId: revisionId,
      planningAuthorityId: brief.planningAuthority.authorityId,
      planningAuthorityDigest: brief.planningAuthority.authorityDigest,
      createdBy: "agent-ai-ceo", createdAt: at, subtasks,
      modelSettlement: planModelSettlement };
    await request(app).post("/v1/internal/agentic/orchestration/plans")
      .set("authorization", "Bearer worker-token").send(plan).expect(401);
    await request(app).post("/v1/internal/agentic/orchestration/plans")
      .set("authorization", "Bearer ai-ceo-token").send(plan).expect(202);
    await request(app).post("/v1/internal/agentic/orchestration/plans")
      .set("authorization", "Bearer ai-ceo-token").send(plan).expect(202);
    const runId = randomUUID();
    await pool.query(`INSERT INTO agentic_workflow_runs
      (id,task_id,workflow_name,workflow_version,plan_revision,temporal_workflow_id,state,created_at,updated_at)
      VALUES($1,$2,'StoreHealthReviewWorkflowV1',1,1,$3,'dispatching',$4,$4)`,
    [runId, taskId, `agentic-task-${taskId}-v1`, at]);
    const dispatch = await request(app).get(`/v1/internal/agentic/orchestration/dispatch-plans/${runId}`)
      .set(worker).expect("cache-control", "no-store").expect(200);
    expect(dispatch.body.data.nodes).toHaveLength(2);
    const descriptorReference = dispatch.body.data.nodes.find(
      (node: { agentKind: string }) => node.agentKind === "catalog",
    ) as { descriptorId: string; descriptorDigest: string; subtaskId: string };
    const descriptor = await request(app)
      .get(`/v1/internal/agentic/orchestration/descriptors/${descriptorReference.descriptorId}`)
      .set(worker).set("x-opendx-descriptor-digest", descriptorReference.descriptorDigest)
      .expect("cache-control", "no-store").expect(200);
    expect(descriptor.body.data.descriptor).toMatchObject({ taskId, subtaskId: descriptorReference.subtaskId, agentKind: "catalog" });
    expect(JSON.stringify(descriptor.body)).not.toContain("client_secret");

    const resultId = randomUUID();
    const catalogToolEvidence = descriptor.body.data.payload.toolGrants.map(
      (grant: { name: string }, index: number) => {
        const provenanceId = randomUUID();
        const summary = { sequence: index + 1 };
        return { toolName: grant.name, provenanceId, summary,
          output: { source: grant.name, sourceVersion: 1,
            retrievedAt: at, window: null,
            freshness: { asOf: at, maxAgeSeconds: 60, status: "fresh" },
            classification: "internal", shareability: "executive_summary",
            provenanceId, summary } };
      },
    );
    const resultProvenanceIds = catalogToolEvidence
      .map(({ provenanceId }: { provenanceId: string }) => provenanceId).sort();
    for (const evidence of catalogToolEvidence) {
      await pool.query(`INSERT INTO agentic_tool_invocations
        (id,task_id,agent_kind,tool_name,tool_version,idempotency_key,parameters_digest,status,
         attempt,safe_result,result_digest,correlation_id,causation_id,version,
         created_at,updated_at,completed_at)
        VALUES($1,$2,'catalog',$3,1,$4,$5,'completed',1,$6::jsonb,$7,$10,$8,2,$9,$9,$9)`,
      [randomUUID(), taskId, evidence.toolName, `result-test:${taskId}:${evidence.toolName}`,
        "2".repeat(64), JSON.stringify(evidence.output), canonicalDigest(evidence.output),
        descriptorReference.subtaskId, at, taskId]);
    }
    const resultBody = { schemaVersion: 1, agentKind: "catalog", status: "partial",
      summary: "Catalog reviewed", conclusions: [], risks: [], recommendedActions: [],
      payload: { toolSummaries: catalogToolEvidence.map(
        ({ toolName, provenanceId, summary }: { toolName: string; provenanceId: string; summary: unknown }) =>
          ({ toolName, provenanceId, summaryDigest: canonicalDigest(summary) }),
      ) } };
    const qualityEvidenceDigest = "7".repeat(64);
    for (const evidence of catalogToolEvidence) {
      await pool.query(`INSERT INTO agentic_provenance_records
        (id,task_id,source_type,source_id,source_digest,classification,recorded_by,recorded_at)
        VALUES($1,$2,'tool_result',$3,$4,'internal','agent-catalog',$5)`,
      [evidence.provenanceId, taskId, evidence.toolName, canonicalDigest(evidence.output), at]);
    }
    const resultModelSettlement = await prepareAtomicSettlement(
      "catalog", "partial", canonicalDigest(resultBody), qualityEvidenceDigest,
      resultProvenanceIds, `descriptor-result:${descriptorReference.subtaskId}`,
      canonicalDigest(catalogToolEvidence.map(
        ({ toolName, output }: { toolName: string; output: unknown }) => ({ toolName, output }),
      )),
      descriptor.body.data.descriptor.resultSchemaName,
      descriptor.body.data.descriptor.resultSchemaDigest,
    );
    const result = { id: resultId, taskId, planVersion: 1, subtaskId: descriptorReference.subtaskId,
      descriptorId: descriptorReference.descriptorId,
      descriptorDigest: descriptorReference.descriptorDigest,
      resultDigest: canonicalDigest(resultBody), qualityEvidenceDigest,
      provenanceDigest: canonicalDigest(resultProvenanceIds), acceptedAt: at, result: resultBody,
      modelSettlement: resultModelSettlement };
    await request(app).post("/v1/internal/agentic/orchestration/results").set(worker).send(result).expect(202);
    await request(app).post("/v1/internal/agentic/orchestration/results").set(worker)
      .send({ ...result, id: randomUUID() }).expect(202);
    await request(app).post("/v1/internal/agentic/orchestration/results").set(worker)
      .send({ ...result, id: randomUUID(), resultDigest: "9".repeat(64) }).expect(400);
    const collaboration = { id: randomUUID(), taskId, planVersion: 1, requester: "catalog",
      requested: "inventory", questionDigest: "a".repeat(64), purpose: "compare_availability",
      requestedDataClassification: "internal", evidenceDigest: "b".repeat(64),
      redactedPayloadDigest: "c".repeat(64), policyVersion: 4, policyDecision: "ALLOW",
      idempotencyKey: `collaboration:${taskId}:1`, createdAt: at };
    await request(app).post("/v1/internal/agentic/orchestration/collaborations")
      .set(worker).send(collaboration).expect(202);
    await request(app).post("/v1/internal/agentic/orchestration/collaborations")
      .set(worker).send({ ...collaboration, id: randomUUID() }).expect(202);
    const inventoryReference = dispatch.body.data.nodes.find(
      (node: { agentKind: string }) => node.agentKind === "inventory",
    ) as { subtaskId: string };
    await request(app).post("/v1/internal/agentic/orchestration/synthesis-contexts")
      .set(worker).send({ taskId, planVersion: 1, branches: [
        { subtaskId: descriptorReference.subtaskId, status: "usable", resultId,
          resultDigest: result.resultDigest, provenanceIds: resultProvenanceIds },
        { subtaskId: inventoryReference.subtaskId, status: "unavailable",
          resultDigest: "8".repeat(64), provenanceIds: [] },
      ] }).expect(400);
    const synthesis = await request(app).post("/v1/internal/agentic/orchestration/synthesis-contexts")
      .set(worker).send({ taskId, planVersion: 1, branches: [
        { subtaskId: descriptorReference.subtaskId, status: "partial", resultId,
          resultDigest: result.resultDigest, provenanceIds: resultProvenanceIds },
        { subtaskId: inventoryReference.subtaskId, status: "unavailable",
          resultDigest: "8".repeat(64), provenanceIds: [] },
      ] }).expect("cache-control", "no-store").expect(200);
    expect(synthesis.body.data.acceptedResults[0].result).toEqual(resultBody);
    expect(synthesis.body.data.costMicros).toBe(4);
    expect(synthesis.body.data.approvalHistoryDigest).toBe(canonicalDigest([]));
    const reportBody = { schemaVersion: 1, completionState: "partial",
      summary: "Catalog reviewed; inventory unavailable", conclusions: [], risks: [],
      recommendedActions: [], conflicts: [], acceptedResultReferences: [{
        resultId, subtaskId: descriptorReference.subtaskId, resultDigest: result.resultDigest,
      }], unavailableBranches: [{ subtaskId: inventoryReference.subtaskId,
        reasonCode: "DEPARTMENT_UNAVAILABLE" }] };
    const synthesisBranches = [
      { subtaskId: descriptorReference.subtaskId, status: "partial" as const, resultId,
        resultDigest: result.resultDigest, provenanceIds: resultProvenanceIds },
      { subtaskId: inventoryReference.subtaskId, status: "unavailable" as const,
        resultDigest: "8".repeat(64), provenanceIds: [] },
    ];
    const synthesisAuthorityResponse = await request(app)
      .get(`/v1/internal/agentic/orchestration/ai-ceo-authorities/${synthesis.body.data.authority.authorityId}`)
      .set(worker).set("x-opendx-authority-digest", synthesis.body.data.authority.authorityDigest)
      .expect(200);
    const synthesisInputDigest = canonicalDigest({
      ...synthesisAuthorityResponse.body.data.payload.authorizedContext,
      branches: [
        ...synthesis.body.data.acceptedResults,
        ...synthesis.body.data.unavailableBranches.map((branch: Record<string, unknown>) => ({
          ...branch, reasonCode: "DEPARTMENT_UNAVAILABLE",
        })),
      ],
    });
    const reportModelSettlement = await prepareAtomicSettlement(
      "ai_ceo", "completed", canonicalDigest(reportBody), "e".repeat(64),
      resultProvenanceIds, `synthesis:${taskId}`,
      synthesisInputDigest,
      synthesisAuthorityResponse.body.data.authority.resultSchemaName,
      synthesisAuthorityResponse.body.data.authority.resultSchemaDigest,
    );
    const report = { id: randomUUID(), taskId, planVersion: 1,
      authorityId: synthesis.body.data.authority.authorityId,
      authorityDigest: synthesis.body.data.authority.authorityDigest,
      reportDigest: canonicalDigest(reportBody), completionState: "partial",
      conclusionProvenanceDigest: canonicalDigest([]),
      unavailableBranchesDigest: canonicalDigest(reportBody.unavailableBranches),
      synthesisBranchesDigest: canonicalDigest(synthesisBranches), synthesisBranches,
      approvalHistoryDigest: synthesis.body.data.approvalHistoryDigest,
      createdAt: at, report: reportBody, modelSettlement: reportModelSettlement };
    await request(app).post("/v1/internal/agentic/orchestration/reports").set(worker)
      .send({ ...report, approvalHistoryDigest: "0".repeat(64) }).expect(400);
    expect((await pool.query(
      "SELECT status FROM agentic_model_runs WHERE id=$1", [reportModelSettlement.runId],
    )).rows[0]).toEqual({ status: "running" });
    expect((await pool.query(
      "SELECT count(*)::int AS count FROM agentic_executive_reports WHERE task_id=$1", [taskId],
    )).rows[0]).toEqual({ count: 0 });
    await request(app).post("/v1/internal/agentic/orchestration/reports").set(worker).send(report).expect(202);
    const recoveredReport = await request(app)
      .get(`/v1/internal/agentic/orchestration/settlements/report/${report.id}`)
      .set(worker).expect("cache-control", "no-store").expect(200);
    expect(recoveredReport.body.data).toMatchObject({
      settled: true, taskId, planVersion: 1,
      synthesisBranchesDigest: report.synthesisBranchesDigest,
      reportDigest: report.reportDigest,
    });
    await request(app).post("/v1/internal/agentic/orchestration/reports")
      .set(worker).send({ ...report, id: randomUUID() }).expect(202);
    await request(app).post("/v1/internal/agentic/orchestration/reports")
      .set(worker).send({ ...report, id: randomUUID(), costMicros: 1 }).expect(400);
    await request(app).post("/v1/internal/agentic/orchestration/reports")
      .set(worker).send({ ...report, id: randomUUID(), reportDigest: "1".repeat(64) }).expect(400);
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM agentic_accepted_orchestration_results WHERE task_id=$1) AS results,
      (SELECT count(*)::int FROM agentic_collaboration_requests WHERE task_id=$1) AS collaborations,
      (SELECT count(*)::int FROM agentic_executive_reports WHERE task_id=$1) AS reports`, [taskId]);
    expect(counts.rows[0]).toEqual({ results: 1, collaborations: 1, reports: 1 });
    const audit = JSON.stringify((await pool.query(
      "SELECT action,result_digest FROM agentic_audit_events WHERE task_id=$1 ORDER BY action", [taskId],
    )).rows);
    expect(audit).not.toContain("private task instructions");
    expect(audit).not.toContain("Bearer");
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
      resultSchemaName: "store_health_catalog_v1",
      resultSchemaDigest: "f".repeat(64),
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
      resultSchemaName: `store_health_${agentKind}_v1`,
      resultSchemaDigest: "f".repeat(64),
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
