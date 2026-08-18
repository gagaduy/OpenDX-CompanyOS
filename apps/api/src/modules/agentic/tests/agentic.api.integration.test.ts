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

  it("shows the exact configuration diff and enforces a different Governance Admin", async () => {
    const children = { policies: [], toolGrants: [], modelConfigurations: [], budgetLimits: [] };
    const created = await request(app).post("/v1/admin/agentic/configuration-revisions")
      .set("authorization", "Bearer agentic_governance_admin:creator").send({ children }).expect(201);
    const revisionId = created.body.data.id as string;
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/submit`)
      .set("authorization", "Bearer agentic_governance_admin:creator").send({ expectedVersion: 1 }).expect(200);
    const diff = await request(app).get(`/v1/admin/agentic/configuration-revisions/${revisionId}/diff`)
      .set("authorization", "Bearer agentic_governance_admin:reviewer").expect(200);
    expect(diff.body.data).toMatchObject({ revisionId, changed: true, candidate: children });
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/decision`)
      .set("authorization", "Bearer agentic_governance_admin:creator")
      .send({ expectedVersion: 2, decision: "activate" }).expect(403);
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/decision`)
      .set("authorization", "Bearer agentic_governance_admin:reviewer")
      .send({ expectedVersion: 2, decision: "activate" }).expect(200);
  });

  it("runs the durable staff and workload HTTP control contract idempotently", async () => {
    const governanceCreator = { authorization: "Bearer agentic_governance_admin:creator" };
    const governanceReviewer = { authorization: "Bearer agentic_governance_admin:reviewer" };
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
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/submit`)
      .set(governanceCreator).send({ expectedVersion: 2 }).expect(200);
    await request(app).post(`/v1/admin/agentic/configuration-revisions/${revisionId}/decision`)
      .set(governanceReviewer).send({ expectedVersion: 3, decision: "activate" }).expect(200);

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
});
