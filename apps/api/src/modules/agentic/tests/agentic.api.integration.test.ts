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
      return { sub: `staff-${token}`, name: token, realm_access: { roles: [token] } };
    },
  };
  const agentic = createAgenticModule({ transactions, staffTokenVerifier: verifier, generateId: randomUUID, now: () => "2026-08-14T12:00:00.000Z" });
  const app = express();
  app.use(correlationIdMiddleware, express.json());
  app.use("/v1/admin/agentic", agentic.adminRouter);
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
  afterAll(async () => pool.end());

  it("persists owner-scoped task intake and exposes the fixed workforce", async () => {
    const authorization = { authorization: "Bearer agentic_operator" };
    const created = await request(app).post("/v1/admin/agentic/tasks").set(authorization).send({
      goal: "Review inventory", instructions: "Use evidence",
      subtasks: [{ agentKind: "inventory", title: "Inspect stock" }], dependencies: [],
    }).expect(201);
    const taskId = created.body.data.task.id as string;
    await request(app).get(`/v1/admin/agentic/tasks/${taskId}`).set(authorization).expect(200);
    await request(app).get(`/v1/admin/agentic/tasks/${taskId}`).set("authorization", "Bearer administrator").expect(200);
    await request(app).get("/v1/admin/agentic/tasks").set("authorization", "Bearer agentic_auditor").expect(403);
    const employees = await request(app).get("/v1/admin/agentic/employees").set("authorization", "Bearer agentic_auditor").expect(200);
    expect(employees.body.data).toHaveLength(7);
  });

  it("records denied access without exposing task instructions", async () => {
    const denied = await request(app).get("/v1/admin/agentic/tasks")
      .set("authorization", "Bearer catalog_manager").expect(403);
    expect(JSON.stringify(denied.body)).not.toContain("instructions");
    expect((await pool.query("SELECT action,outcome FROM agentic_audit_events")).rows)
      .toEqual([{ action: "agentic.task.list.denied", outcome: "denied" }]);
  });
});
