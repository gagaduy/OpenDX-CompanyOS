#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const disposableDatabase = `opendx_phase_c_tools_${process.pid}_test`;
const disposableApiContainer = `opendx-phase-c-tools-api-${process.pid}`;
const disposableApiPort = 14_000 + (process.pid % 1_000);
let apiBaseUrl = process.env.AGENTIC_CHECK_API_URL
  ?? `http://127.0.0.1:${disposableApiPort}`;
const keycloakBaseUrl = process.env.AGENTIC_CHECK_KEYCLOAK_URL ?? "http://localhost:8080";
const maintenanceLockPath = process.env.OPENDX_MAINTENANCE_LOCK_DIR
  ?? "/tmp/opendx-database-maintenance.lock";
const composePrefix = [
  "compose",
  ...(existsSync(".env") ? ["--env-file", ".env"] : []),
  "-f",
  "infra/docker/docker-compose.yml",
];
const created = {
  taskId: undefined,
  revisionId: undefined,
  previousActiveRevisionIds: [],
  setupComplete: false,
  databaseCreated: false,
  apiStarted: false,
};
const prohibitedValues = [
  "Canary Product Name", "canary@example.invalid", "+84999999999",
  "Canary Home Address", "Canary CRM note body", "Canary ticket text",
  "provider-canary-id", "sha256-canary-payload-hash",
];

export const DEPARTMENT_TOOLS = Object.freeze([
  tool("catalog.product_completeness", "catalog", "internal", "executive_summary"),
  tool("catalog.publication_readiness", "catalog", "internal", "executive_summary"),
  tool("catalog.merchandising_summary", "catalog", "internal", "executive_summary"),
  tool("inventory.stock_risk", "inventory", "internal", "executive_summary"),
  tool("inventory.slow_stock", "inventory", "internal", "executive_summary"),
  tool("inventory.reservation_anomalies", "inventory", "confidential", "department_only"),
  tool("order.stalled_summary", "order", "confidential", "executive_summary"),
  tool("order.invalid_state_evidence", "order", "confidential", "department_only"),
  tool("order.expiry_risk", "order", "confidential", "executive_summary"),
  tool("finance.pending_payments", "finance", "confidential", "executive_summary"),
  tool("finance.reconciliation_discrepancies", "finance", "restricted", "department_only"),
  tool("finance.provider_evidence_status", "finance", "restricted", "department_only"),
  tool("crm.segment_summary", "crm", "confidential", "executive_summary"),
  tool("crm.followup_opportunities", "crm", "restricted", "department_only"),
  tool("support.sla_risk", "support", "restricted", "executive_summary"),
  tool("support.classification_summary", "support", "confidential", "executive_summary"),
  tool("support.related_order_context", "support", "restricted", "department_only"),
]);

function tool(name, department, classification, shareability) {
  return Object.freeze({
    name,
    department,
    version: 1,
    purpose: "store_health_review",
    dataScope: `${department}:health:read`,
    classification,
    shareability,
  });
}

export function parametersFor(name, context) {
  const window = {
    start: context.start,
    end: context.end,
    timezone: "Asia/Ho_Chi_Minh",
  };
  const evidenceWindow = { ...window, limit: 25 };
  switch (name) {
    case "catalog.product_completeness":
    case "catalog.merchandising_summary": return {};
    case "catalog.publication_readiness":
    case "inventory.reservation_anomalies":
    case "order.invalid_state_evidence":
    case "finance.reconciliation_discrepancies": return evidenceWindow;
    case "inventory.stock_risk": return { ...evidenceWindow, lowStockThreshold: 5 };
    case "inventory.slow_stock": return { ...evidenceWindow, minimumOnHand: 1 };
    case "order.stalled_summary": return { ...evidenceWindow, minimumAgeMinutes: 120 };
    case "order.expiry_risk": return { ...evidenceWindow, horizonMinutes: 120 };
    case "support.sla_risk": return { ...evidenceWindow, horizonMinutes: 240 };
    case "finance.pending_payments":
    case "finance.provider_evidence_status":
    case "crm.segment_summary":
    case "crm.followup_opportunities":
    case "support.classification_summary": return window;
    case "support.related_order_context": return { ticketId: context.ticketId };
    default: throw new Error(`Unknown Department tool: ${name}`);
  }
}

export function toExecutiveSummary(result) {
  if (result.shareability !== "executive_summary") {
    throw new Error("Tool result is not executive-shareable");
  }
  return {
    source: result.source,
    sourceVersion: result.sourceVersion,
    retrievedAt: result.retrievedAt,
    window: result.window,
    freshness: result.freshness,
    classification: result.classification,
    provenanceId: result.provenanceId,
    summary: result.summary,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result.stdout.trim();
}

function compose(args, options = {}) {
  return run("docker", [...composePrefix, ...args], options);
}

function sql(query, user = "opendx_local") {
  return compose([
    "exec", "-T", "postgres", "psql", "-X", "-U", user, "-d", disposableDatabase,
    "-v", "ON_ERROR_STOP=1", "-Atqc", query,
  ]);
}

function adminSql(script) {
  compose([
    "exec", "-T", "postgres", "psql", "-X", "-U", "opendx_admin", "-d", disposableDatabase,
    "-v", "ON_ERROR_STOP=1",
  ], { input: script });
}

function prepareDisposableEnvironment() {
  compose(["up", "-d", "postgres", "minio", "keycloak"]);
  compose([
    "exec", "-T", "postgres", "psql", "-X", "-U", "opendx_admin", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c",
    `CREATE DATABASE ${disposableDatabase} OWNER opendx_local`,
  ]);
  created.databaseCreated = true;
  const hostDatabaseUrl = `postgresql://opendx_local:opendx_local_password@localhost:${process.env.POSTGRES_PORT ?? "55432"}/${disposableDatabase}`;
  run("pnpm", ["--filter", "@opendx/api", "db:migrate:all"], {
    env: { ...process.env, DATABASE_URL: hostDatabaseUrl },
  });
  const customerId = randomUUID();
  const ticketId = randomUUID();
  adminSql(`
    INSERT INTO customers
      (id,email,email_verified_at,full_name,phone_number,status,version,created_at,updated_at)
      VALUES('${customerId}','phase-c-fixture@example.invalid',now(),
        'Phase C Fixture','0900000000','active',1,now(),now());
    INSERT INTO support_tickets
      (id,customer_id,subject,description,priority,status,version,created_by_id,created_at,updated_at)
      VALUES('${ticketId}','${customerId}','Phase C fixture','Disposable read-only fixture',
        'normal','new',1,'phase-c-check',now(),now());
  `);
  compose([
    "run", "-d", "--rm", "--no-deps", "--name", disposableApiContainer,
    "-p", `${disposableApiPort}:${disposableApiPort}`,
    "-e", `API_PORT=${disposableApiPort}`,
    "-e", `DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/${disposableDatabase}`,
    "-e", `AGENTIC_ANALYTICS_DATABASE_URL=postgres://opendx_agentic_reader:opendx_agentic_reader_password@postgres:5432/${disposableDatabase}`,
    "api",
  ]);
  created.apiStarted = true;
}

function disposeEnvironment() {
  if (created.apiStarted) {
    spawnSync("docker", ["rm", "-f", disposableApiContainer], {
      cwd: root, encoding: "utf8",
    });
    created.apiStarted = false;
  }
  if (created.databaseCreated) {
    compose([
      "exec", "-T", "postgres", "psql", "-X", "-U", "opendx_admin", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${disposableDatabase}'`,
    ]);
    compose([
      "exec", "-T", "postgres", "psql", "-X", "-U", "opendx_admin", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${disposableDatabase}`,
    ]);
    created.databaseCreated = false;
  }
}

async function waitForApi() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/health/ready`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for API readiness");
}

async function clientToken(clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(
    `${keycloakBaseUrl}/realms/opendx/protocol/openid-connect/token`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
  );
  const payload = await response.json();
  assert.equal(response.status, 200, `Keycloak rejected ${clientId}`);
  assert.equal(typeof payload.access_token, "string", `Keycloak omitted ${clientId} token`);
  return payload.access_token;
}

async function aiCeoToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: environmentValue("KEYCLOAK_ADMIN", "opendx_admin"),
    password: environmentValue("KEYCLOAK_ADMIN_PASSWORD", "opendx_admin_password"),
  });
  const tokenResponse = await fetch(
    `${keycloakBaseUrl}/realms/master/protocol/openid-connect/token`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
  );
  const tokenPayload = await tokenResponse.json();
  assert.equal(tokenResponse.status, 200, "Keycloak admin authentication failed");
  const headers = { authorization: `Bearer ${tokenPayload.access_token}` };
  const clientsResponse = await fetch(
    `${keycloakBaseUrl}/admin/realms/opendx/clients?clientId=agent-ai-ceo`,
    { headers },
  );
  const clients = await clientsResponse.json();
  assert.equal(clientsResponse.status, 200, "AI CEO client lookup failed");
  assert.equal(clients.length, 1, "AI CEO client must be unique");
  const secretResponse = await fetch(
    `${keycloakBaseUrl}/admin/realms/opendx/clients/${clients[0].id}/client-secret`,
    { headers },
  );
  const secret = await secretResponse.json();
  assert.equal(secretResponse.status, 200, "AI CEO credential lookup failed");
  assert.equal(typeof secret.value, "string", "AI CEO client secret is unavailable");
  return clientToken("agent-ai-ceo", secret.value);
}

function environmentValue(name, fallback) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env")) return fallback;
  const match = readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1]?.replace(/^['"]|['"]$/g, "") || fallback;
}

async function invoke(token, body, expectedStatus = 200) {
  const response = await fetch(`${apiBaseUrl}/v1/internal/agentic/tools/invoke`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-correlation-id": body.correlationId,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => undefined);
  assert.equal(
    response.status,
    expectedStatus,
    `${body.toolName} returned ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

function requestBody(descriptor, context, marker) {
  return {
    taskId: created.taskId,
    toolName: descriptor.name,
    toolVersion: descriptor.version,
    purpose: descriptor.purpose,
    dataScope: descriptor.dataScope,
    dataClassification: descriptor.classification,
    modelId: "openai/gpt-5-mini",
    parameters: parametersFor(descriptor.name, context),
    idempotencyKey: `phase-c-${marker}`,
    correlationId: `phase-c-correlation-${marker}`,
    causationId: `phase-c-causation-${marker}`,
  };
}

function createFixture() {
  created.revisionId = randomUUID();
  created.taskId = randomUUID();
  created.previousActiveRevisionIds = sql(
    "SELECT id FROM agentic_configuration_revisions WHERE state='active' ORDER BY id",
  ).split("\n").filter(Boolean);
  const modelRows = [...new Set(DEPARTMENT_TOOLS.map(({ department }) => department))]
    .map((department) => `('${created.revisionId}','${department}','openai/gpt-5-mini',1000,500,5000,1,0,0)`)
    .join(",\n");
  const budgetRows = [...new Set(DEPARTMENT_TOOLS.map(({ department }) => department))]
    .map((department) => `('${created.revisionId}','${department}',100,1000,10000)`)
    .join(",\n");
  const grantRows = DEPARTMENT_TOOLS.map((descriptor) =>
    `('${randomUUID()}','${created.revisionId}','${descriptor.department}','${descriptor.name}',1,'store_health_review','${descriptor.dataScope}',10)`).join(",\n");
  const policyRows = DEPARTMENT_TOOLS.map((descriptor, index) =>
    `('${randomUUID()}','${created.revisionId}',${index},'ALLOW','agent','${descriptor.department}',NULL,'${descriptor.name}','invoke','store_health_review','${descriptor.classification}','DEPARTMENT_READ_ALLOWED')`).join(",\n");
  const subtaskRows = [...new Set(DEPARTMENT_TOOLS.map(({ department }) => department))]
    .map((department) => `('${randomUUID()}','${created.taskId}','${department}','Review ${department} health')`)
    .join(",\n");
  adminSql(`
    BEGIN;
    SET LOCAL session_replication_role=replica;
    UPDATE agentic_configuration_revisions SET state='superseded',updated_at=now()
      WHERE state='active';
    INSERT INTO agentic_configuration_revisions
      (id,state,created_by,payload_digest,decided_by,decision_reason,decided_at,version)
      VALUES('${created.revisionId}','active','phase-c-check','${"a".repeat(64)}',
        'phase-c-reviewer','Live acceptance fixture',now(),1);
    INSERT INTO agentic_model_configs
      (revision_id,agent_kind,primary_model,max_input_tokens,max_output_tokens,timeout_ms,
       max_retries,input_cost_micros_per_million,output_cost_micros_per_million)
      VALUES ${modelRows};
    INSERT INTO agentic_budget_limits
      (revision_id,agent_kind,task_cost_micros,daily_cost_micros,monthly_cost_micros)
      VALUES ${budgetRows};
    INSERT INTO agentic_tool_grants
      (id,revision_id,agent_kind,tool_name,tool_version,purpose,data_scope,max_invocations)
      VALUES ${grantRows};
    INSERT INTO agentic_policies
      (id,revision_id,rule_order,effect,actor_type,agent_kind,department,resource,action,
       purpose,data_classification,reason_code)
      VALUES ${policyRows};
    INSERT INTO agentic_tasks
      (id,state,created_by,goal,instructions,configuration_revision_id,version)
      VALUES('${created.taskId}','ready','phase-c-check','Phase C live Department tools acceptance',
        'Read-only acceptance; no Commerce mutation','${created.revisionId}',1);
    INSERT INTO agentic_subtasks(id,task_id,agent_kind,title) VALUES ${subtaskRows};
    COMMIT;
  `);
  created.setupComplete = true;
}

function validateResult(descriptor, payload) {
  const result = payload?.data?.output;
  assert.equal(payload?.success, true, `${descriptor.name} response is not successful`);
  assert.equal(typeof result?.source, "string", `${descriptor.name} has no source`);
  assert.equal(result?.sourceVersion, 1, `${descriptor.name} source version drifted`);
  assert.equal(result?.shareability, descriptor.shareability, `${descriptor.name} sharing drifted`);
  assert.equal(typeof result?.provenanceId, "string", `${descriptor.name} has no provenance`);
  assert.deepEqual(payload.data.provenanceIds, [result.provenanceId]);
  assert.equal(result?.freshness?.maxAgeSeconds, 60, `${descriptor.name} freshness drifted`);
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") <= 262_144);
  assert.ok(!Array.isArray(result.evidence) || result.evidence.length <= 100);
  const serialized = JSON.stringify(payload);
  for (const prohibited of prohibitedValues) assert.ok(!serialized.includes(prohibited));
  if (descriptor.shareability === "executive_summary") {
    const shared = toExecutiveSummary(result);
    assert.ok(!JSON.stringify(shared).match(/evidence|nextCursor|shareability/));
  } else {
    assert.throws(() => toExecutiveSummary(result), /not executive-shareable/i);
  }
  return result.provenanceId;
}

function validatePersistence(provenanceIds) {
  const evidence = JSON.parse(sql(`
    SELECT json_build_object(
      'completed',(SELECT count(*) FROM agentic_tool_invocations
        WHERE task_id='${created.taskId}' AND status='completed'),
      'inputs',(SELECT count(*) FROM agentic_provenance_records
        WHERE task_id='${created.taskId}' AND source_type='tool_input'),
      'results',(SELECT count(*) FROM agentic_provenance_records
        WHERE task_id='${created.taskId}' AND source_type='tool_result'),
      'allowed',(SELECT count(*) FROM agentic_audit_events
        WHERE task_id='${created.taskId}' AND action='tool.invoke' AND outcome='allowed'),
      'resultIds',(SELECT count(*) FROM agentic_provenance_records
        WHERE task_id='${created.taskId}' AND id=ANY(ARRAY[${provenanceIds.map((id) => `'${id}'::uuid`).join(",")}]))
    )
  `));
  assert.deepEqual(
    Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, Number(value)])),
    { completed: 17, inputs: 17, results: 17, allowed: 17, resultIds: 17 },
  );
  const grants = sql(`
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee='opendx_agentic_reader' AND privilege_type='SELECT'
    ORDER BY table_name
  `).split("\n").filter(Boolean);
  assert.deepEqual(grants, [
    "reporting_agentic_customer_activity_daily_v1",
    "reporting_agentic_customer_segment_snapshot_v2",
    "reporting_agentic_variant_sales_v1",
  ]);
}

function commerceDigest() {
  return compose([
    "exec", "-T", "postgres", "sh", "-ec",
    `pg_dump -U opendx_admin -d ${disposableDatabase} --data-only --restrict-key=opendx_phase_c_check --exclude-table='agentic_*' --exclude-table='reporting_agentic_*' --exclude-table='*_migrations' | sha256sum | cut -d' ' -f1`,
  ]);
}

async function cleanup() {
  if (!created.setupComplete) return;
  const restoreActive = created.previousActiveRevisionIds.map((id) =>
    `UPDATE agentic_configuration_revisions SET state='active',updated_at=now() WHERE id='${id}';`).join("\n");
  adminSql(`
    BEGIN;
    SET LOCAL session_replication_role=replica;
    DELETE FROM agentic_tool_invocations WHERE task_id='${created.taskId}';
    DELETE FROM agentic_audit_events WHERE task_id='${created.taskId}';
    DELETE FROM agentic_provenance_records WHERE task_id='${created.taskId}';
    DELETE FROM agentic_budget_entries WHERE task_id='${created.taskId}';
    DELETE FROM agentic_approval_requests WHERE task_id='${created.taskId}';
    DELETE FROM agentic_subtask_dependencies WHERE task_id='${created.taskId}';
    DELETE FROM agentic_subtasks WHERE task_id='${created.taskId}';
    DELETE FROM agentic_tasks WHERE id='${created.taskId}';
    DELETE FROM agentic_model_fallbacks WHERE revision_id='${created.revisionId}';
    DELETE FROM agentic_model_configs WHERE revision_id='${created.revisionId}';
    DELETE FROM agentic_budget_limits WHERE revision_id='${created.revisionId}';
    DELETE FROM agentic_tool_grants WHERE revision_id='${created.revisionId}';
    DELETE FROM agentic_policies WHERE revision_id='${created.revisionId}';
    DELETE FROM agentic_configuration_revisions WHERE id='${created.revisionId}';
    ${restoreActive}
    COMMIT;
  `);
}

async function runAcceptance() {
  await waitForApi();
  const beforeCommerce = commerceDigest();
  createFixture();
  const departments = [...new Set(DEPARTMENT_TOOLS.map(({ department }) => department))];
  const credentials = Object.fromEntries(await Promise.all(departments.map(async (department) => [
    department,
    await clientToken(
      `agent-${department}`,
      environmentValue(
        `AGENT_${department.toUpperCase()}_CLIENT_SECRET`,
        `opendx_agent_${department}_change_me`,
      ),
    ),
  ])));
  assert.equal(new Set(Object.values(credentials)).size, 6, "Department credentials are not distinct");
  const ceoCredential = await aiCeoToken();
  const now = Date.now();
  const context = {
    start: new Date(now - 24 * 60 * 60 * 1_000).toISOString(),
    end: new Date(now).toISOString(),
    ticketId: sql("SELECT id FROM support_tickets ORDER BY created_at,id LIMIT 1"),
  };
  assert.match(context.ticketId, /^[0-9a-f-]{36}$/i, "Seeded Support ticket is required");
  const provenanceIds = [];
  for (const [index, descriptor] of DEPARTMENT_TOOLS.entries()) {
    const payload = await invoke(
      credentials[descriptor.department],
      requestBody(descriptor, context, `${index}-${randomUUID()}`),
    );
    provenanceIds.push(validateResult(descriptor, payload));
    process.stdout.write(`Checked ${descriptor.name}@1\n`);
  }
  for (const [index, department] of departments.entries()) {
    const foreign = DEPARTMENT_TOOLS.find(
      ({ department: owner }) => owner === departments[(index + 1) % departments.length],
    );
    const denied = await invoke(
      credentials[department],
      requestBody(foreign, context, `cross-${department}-${randomUUID()}`),
      403,
    );
    assert.equal(denied.errorCode, "TOOL_SCOPE_DENIED");
  }
  const aiCeoDenied = await invoke(
    ceoCredential,
    requestBody(DEPARTMENT_TOOLS[0], context, `ai-ceo-${randomUUID()}`),
    403,
  );
  assert.equal(aiCeoDenied.errorCode, "TOOL_SCOPE_DENIED");
  validatePersistence(provenanceIds);
  assert.equal(commerceDigest(), beforeCommerce, "Department tools changed Commerce records");
}

export async function main() {
  mkdirSync(maintenanceLockPath, { mode: 0o700 });
  writeFileSync(`${maintenanceLockPath}/owner`, String(process.pid), { mode: 0o600 });
  let failure;
  try {
    prepareDisposableEnvironment();
    await runAcceptance();
  } catch (error) {
    failure = error;
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      if (failure === undefined) failure = cleanupError;
      else process.stderr.write(`Cleanup also failed: ${cleanupError.stack ?? cleanupError}\n`);
    }
    try {
      disposeEnvironment();
    } catch (disposeError) {
      if (failure === undefined) failure = disposeError;
      else process.stderr.write(`Disposal also failed: ${disposeError.stack ?? disposeError}\n`);
    }
    rmSync(`${maintenanceLockPath}/owner`, { force: true });
    rmdirSync(maintenanceLockPath);
  }
  if (failure !== undefined) throw failure;
  process.stdout.write("Agentic Department tools check passed.\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(root, relative(root, process.argv[1]))) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
