// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../../../app";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../shared/testing/assert-integration-environment";
import { createAgenticModule } from "../agentic.module";
import type { DepartmentToolExecutionContext } from "../application/services/interfaces/department-tool-adapter";
import { DEPARTMENT_TOOL_CATALOG } from "../application/tools/department-tool-catalog";
import type { DepartmentAgentKind, DepartmentToolName } from "../application/tools/department-tool-contracts";
import { runAgenticMigrations } from "../infrastructure/database/run-agentic-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const now = "2026-08-16T05:00:00.000Z";
const start = "2026-08-15T05:00:00.000Z";
const end = "2026-08-16T05:00:00.000Z";
const ticketId = "11111111-1111-4111-8111-111111111111";
const canaries = [
  "Canary Product Name", "canary@example.invalid", "+84999999999",
  "Canary Home Address", "Canary CRM note body", "Canary ticket text",
  "provider-canary-id", "sha256-canary-payload-hash",
] as const;

suite("Agentic department tool PostgreSQL API", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  let taskId = "";

  const verifier = {
    async verify(token: string) {
      if (!token.startsWith("agent-")) throw new Error("wrong audience");
      return { sub: `service-account-${token}`, azp: token };
    },
  };
  const agentic = createAgenticModule({
    transactions,
    staffTokenVerifier: verifier,
    workloadTokenVerifier: { verify: async () => ({ sub: "worker", azp: "worker" }) },
    workflowGateway: {
      probe: async () => undefined,
      start: async () => ({ temporalRunId: "unused", duplicate: false }),
      signalApproval: async () => undefined,
      signalCancellation: async () => undefined,
      describe: async () => ({ status: "running" as const }),
    },
    generateId: randomUUID,
    now: () => now,
    workflowApprovalTtlMs: 3_600_000,
    dispatcherIntervalMs: 5_000,
    dispatcherBatchSize: 20,
    toolAdapters: {
      resolve: () => ({
        execute: async (context: DepartmentToolExecutionContext) => safeOutput(context),
      }),
    },
  });
  const app = createApiApp({ agenticToolRouter: agentic.toolRouter });

  beforeAll(async () => runAgenticMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await resetAgenticData(pool);
    taskId = await seedGovernedTask(pool);
  });
  afterAll(async () => {
    await runAgenticMigrations(databaseUrl!, "down", 999_999);
    await pool.end();
  });

  it("invokes all 17 tools without leaking source-sensitive values", async () => {
    const serializedResponses: string[] = [];
    for (const [index, descriptor] of DEPARTMENT_TOOL_CATALOG.entries()) {
      const response = await request(app)
        .post("/v1/internal/agentic/tools/invoke")
        .set("authorization", `Bearer agent-${descriptor.agentKind}`)
        .send({
          taskId,
          toolName: descriptor.name,
          toolVersion: descriptor.version,
          purpose: descriptor.purpose,
          dataScope: descriptor.dataScope,
          dataClassification: descriptor.classification,
          modelId: "openai/gpt-5-mini",
          parameters: parametersFor(descriptor.name),
          idempotencyKey: `integration-${index}`,
          correlationId: `correlation-${index}`,
          causationId: `causation-${index}`,
        });
      if (response.status !== 200) {
        throw new Error(`${descriptor.name} returned ${response.status}: ${JSON.stringify(response.body)}`);
      }
      serializedResponses.push(JSON.stringify(response.body));
    }

    const persistence = await pool.query(`
      SELECT row_to_json(record)::text value FROM (
        SELECT actor_id,action,resource_type,resource_id,outcome,correlation_id,causation_id
        FROM agentic_audit_events
        UNION ALL
        SELECT recorded_by,source_type,source_id,classification,'','', ''
        FROM agentic_provenance_records
        UNION ALL
        SELECT agent_kind,tool_name,status,coalesce(error_code,''),correlation_id,causation_id,''
        FROM agentic_tool_invocations
      ) record
    `);
    const exposed = [...serializedResponses, ...persistence.rows.map((row) => String(row.value))].join("\n");
    for (const canary of canaries) expect(exposed).not.toContain(canary);
    expect(serializedResponses).toHaveLength(17);
    expect((await pool.query("SELECT count(*)::int total FROM agentic_tool_invocations WHERE status='completed'")).rows[0]?.total)
      .toBe(17);
  });

  it("enforces the database identity and task assignment", async () => {
    const invocation = requestBody("catalog.product_completeness", "cross-agent");
    await request(app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer agent-inventory").send(invocation).expect(403);
    await request(app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer agent-unknown").send(invocation).expect(401);
  });

  function requestBody(toolName: DepartmentToolName, idempotencyKey: string) {
    const descriptor = DEPARTMENT_TOOL_CATALOG.find((tool) => tool.name === toolName)!;
    return {
      taskId,
      toolName,
      toolVersion: 1,
      purpose: descriptor.purpose,
      dataScope: descriptor.dataScope,
      dataClassification: descriptor.classification,
      modelId: "openai/gpt-5-mini",
      parameters: parametersFor(toolName),
      idempotencyKey,
      correlationId: `correlation-${idempotencyKey}`,
      causationId: `causation-${idempotencyKey}`,
    };
  }
});

async function resetAgenticData(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE agentic_tool_invocations,agentic_provenance_records,
    agentic_audit_events,agentic_revocations,agentic_approval_requests,
    agentic_budget_entries,agentic_budget_limits,agentic_model_fallbacks,
    agentic_model_configs,agentic_tool_grants,agentic_tools,agentic_policies,
    agentic_subtask_dependencies,agentic_subtasks,agentic_tasks,
    agentic_configuration_revisions,agentic_agents CASCADE`);
  await pool.query(`INSERT INTO agentic_agents(kind,keycloak_client_id) VALUES
    ('ai_ceo','agent-ai-ceo'),('catalog','agent-catalog'),('inventory','agent-inventory'),
    ('order','agent-order'),('finance','agent-finance'),('crm','agent-crm'),('support','agent-support')`);
  for (const descriptor of DEPARTMENT_TOOL_CATALOG) {
    await pool.query(
      `INSERT INTO agentic_tools
       (name,version,input_schema_digest,output_schema_digest,active,execution_cost_micros,maximum_attempts)
       VALUES($1,$2,$3,$4,true,$5,$6) ON CONFLICT(name,version) DO NOTHING`,
      [descriptor.name, descriptor.version, descriptor.inputSchemaDigest,
        descriptor.outputSchemaDigest, descriptor.executionCostMicros, descriptor.maximumAttempts],
    );
  }
}

async function seedGovernedTask(pool: Pool): Promise<string> {
  const revisionId = randomUUID();
  const taskId = randomUUID();
  await pool.query(
    `INSERT INTO agentic_configuration_revisions(id,state,created_by,payload_digest)
     VALUES($1,'draft','governance-admin',$2)`,
    [revisionId, "a".repeat(64)],
  );
  const kinds = ["catalog", "inventory", "order", "finance", "crm", "support"] as const;
  for (const kind of kinds) {
    await pool.query(
      `INSERT INTO agentic_model_configs
       (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
        max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
       VALUES($1,$2,'openai/gpt-5-mini',1000,500,5000,1,0,0)`,
      [revisionId, kind],
    );
    await pool.query(
      `INSERT INTO agentic_budget_limits
       (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
       VALUES($1,$2,100,1000,10000)`,
      [revisionId, kind],
    );
  }
  for (const [ruleOrder, descriptor] of DEPARTMENT_TOOL_CATALOG.entries()) {
    await pool.query(
      `INSERT INTO agentic_tool_grants
       (id,revision_id,agent_kind,tool_name,tool_version,purpose,data_scope,max_invocations)
       VALUES($1,$2,$3,$4,1,$5,$6,10)`,
      [randomUUID(), revisionId, descriptor.agentKind, descriptor.name,
        descriptor.purpose, descriptor.dataScope],
    );
    await pool.query(
      `INSERT INTO agentic_policies
       (id,revision_id,rule_order,effect,actor_type,agent_kind,resource,action,purpose,data_classification,reason_code)
       VALUES($1,$2,$3,'ALLOW','agent',$4,$5,'invoke',$6,$7,'DEPARTMENT_READ_ALLOWED')`,
      [randomUUID(), revisionId, ruleOrder, descriptor.agentKind, descriptor.name,
        descriptor.purpose, descriptor.classification],
    );
  }
  await pool.query(
    `UPDATE agentic_configuration_revisions SET state='active',decided_by='reviewer',
       decision_reason='integration fixture',decided_at=$2,version=2 WHERE id=$1`,
    [revisionId, now],
  );
  await pool.query(
    `INSERT INTO agentic_tasks
     (id,state,created_by,goal,instructions,configuration_revision_id)
     VALUES($1,'ready','operator','Review store health',$2,$3)`,
    [taskId, canaries.join(" | "), revisionId],
  );
  for (const kind of kinds) {
    await pool.query(
      "INSERT INTO agentic_subtasks(id,task_id,agent_kind,title) VALUES($1,$2,$3,$4)",
      [randomUUID(), taskId, kind, `Review ${kind}`],
    );
  }
  return taskId;
}

function parametersFor(name: DepartmentToolName): Record<string, unknown> {
  if (name === "catalog.product_completeness" || name === "catalog.merchandising_summary") return {};
  if (name === "support.related_order_context") return { ticketId };
  const aggregate = new Set<DepartmentToolName>([
    "finance.pending_payments", "finance.provider_evidence_status",
    "crm.segment_summary", "crm.followup_opportunities", "support.classification_summary",
  ]);
  return aggregate.has(name)
    ? { start, end, timezone: "Asia/Ho_Chi_Minh" }
    : { start, end, timezone: "Asia/Ho_Chi_Minh", limit: 25 };
}

function safeOutput(context: DepartmentToolExecutionContext): Record<string, unknown> {
  const descriptor = DEPARTMENT_TOOL_CATALOG.find((tool) => tool.name === context.toolName)!;
  const window = parametersFor(context.toolName).start === undefined
    ? null
    : { start, end, timezone: "Asia/Ho_Chi_Minh" };
  return {
    source: `${context.agentKind}.health`, sourceVersion: 1, retrievedAt: now, window,
    freshness: { asOf: now, maxAgeSeconds: 60, status: "fresh" },
    classification: descriptor.classification, shareability: descriptor.shareability,
    provenanceId: context.invocationId,
    summary: emptySummary(context.toolName),
    ...(hasEvidence(context.toolName) ? { evidence: [] } : {}),
  };
}

function hasEvidence(name: DepartmentToolName): boolean {
  return !new Set<DepartmentToolName>([
    "catalog.product_completeness", "catalog.merchandising_summary",
    "finance.pending_payments", "finance.provider_evidence_status",
    "crm.segment_summary", "crm.followup_opportunities",
    "support.classification_summary", "support.related_order_context",
  ]).has(name);
}

function emptySummary(name: DepartmentToolName): Record<string, unknown> {
  switch (name) {
    case "catalog.product_completeness": return { totalProducts: 0, draftProducts: 0, publishedProducts: 0, missingBrand: 0, emptyAttributes: 0, withoutActiveVariant: 0, withoutCurrentPrice: 0, withoutMedia: 0, withoutPrimaryMedia: 0, completenessBasisPoints: 0 };
    case "catalog.publication_readiness": return { draftReviewed: 0, readyCount: 0, blockedCount: 0, reasonCounts: [] };
    case "catalog.merchandising_summary": return { activeCategories: 0, publishedProducts: 0, activeVariants: 0, currentlyPricedVariants: 0, mediaCoverageBasisPoints: 0, minimumPriceVnd: null, maximumPriceVnd: null, categoryDistribution: [], otherCategoryProductCount: 0 };
    case "inventory.stock_risk": return { trackedVariants: 0, lowStockCount: 0, soldOutCount: 0, unitsOnHand: 0, unitsReserved: 0, unitsAvailable: 0 };
    case "inventory.slow_stock": return { candidateCount: 0, candidateUnits: 0, candidateValueVnd: 0 };
    case "inventory.reservation_anomalies": return { expiredActiveCount: 0, finalizedWithoutTimestampCount: 0, stalePendingCount: 0, affectedUnits: 0 };
    case "order.stalled_summary": return { stalledCount: 0, stalledTotalVnd: 0, countsByStatus: [] };
    case "order.invalid_state_evidence": return { invalidCount: 0, reasonCounts: [] };
    case "order.expiry_risk": return { atRiskCount: 0, atRiskTotalVnd: 0, earliestExpiryAt: null };
    case "finance.pending_payments": return { pendingCount: 0, pendingExpectedAmountVnd: 0, oldestCreatedAt: null, countsByStatus: [], ageBuckets: [] };
    case "finance.reconciliation_discrepancies": return { reconciliationCount: 0, mismatchCount: 0, providerErrorCount: 0, unsupportedCount: 0, amountDifferenceVnd: 0 };
    case "finance.provider_evidence_status": return { authenticatedEvents: 0, rejectedEvents: 0, appliedEvents: 0, reviewRequiredEvents: 0, unmatchedPayments: 0, coverageBasisPoints: 0, countsByNormalizedState: [] };
    case "crm.segment_summary": return { registeredCustomers: 0, newCustomers: 0, repeatCustomers: 0, customersByLifetimeValueBucket: [], customersByRecencyBucket: [], paidRevenueVnd: 0 };
    case "crm.followup_opportunities": return { openFollowups: 0, overdueFollowups: 0, unassignedFollowups: 0, customersWithoutOpenFollowupBySegment: [], reasonCounts: [] };
    case "support.sla_risk": return { openTickets: 0, atRiskCount: 0, breachedCount: 0, countsByPriority: [] };
    case "support.classification_summary": return { countsByPriority: [], countsByStatus: [], operationalClasses: [], unassignedCount: 0, escalatedCount: 0 };
    case "support.related_order_context": return { ticketId, hasRelatedOrder: false };
  }
}
