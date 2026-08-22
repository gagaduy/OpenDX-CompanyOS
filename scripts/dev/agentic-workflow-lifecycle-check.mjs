// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, existsSync, mkdirSync, openSync, rmSync, rmdirSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";

const apiBaseUrl = process.env.AGENTIC_CHECK_API_URL ?? "http://localhost:4000";
const keycloakBaseUrl = process.env.AGENTIC_CHECK_KEYCLOAK_URL ?? "http://localhost:8080";
const composePrefix = [
  "compose",
  ...(existsSync(".env") ? ["--env-file", ".env"] : []),
  "-f",
  "infra/docker/docker-compose.yml",
];
const terminalStates = new Set(["completed", "partially_completed", "failed", "canceled"]);
const lifecycleLockPath = "/tmp/opendx-agentic-workflow-check.lock";
const maintenanceLockPath = process.env.OPENDX_MAINTENANCE_LOCK_DIR
  ?? "/tmp/opendx-database-maintenance.lock";
const created = {
  taskId: undefined,
  runId: undefined,
  workflowId: undefined,
  killedInvocationKey: undefined,
  revisionId: undefined,
  ownsRevision: false,
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
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
    "exec", "-T", "postgres", "psql", "-X", "-U", user, "-d", "opendx",
    "-v", "ON_ERROR_STOP=1", "-Atqc", query,
  ]);
}

async function waitFor(description, operation, timeoutMs = 90_000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value !== undefined && value !== false) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ""}`);
}

async function request(path, { token, method = "GET", body, statuses = [200] } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "x-correlation-id": randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => undefined);
  if (!statuses.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload?.data;
}

async function token(username, password) {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "opendx-lifecycle-check",
    username,
    password,
  });
  const response = await fetch(
    `${keycloakBaseUrl}/realms/opendx/protocol/openid-connect/token`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
  );
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(typeof payload.access_token, "string");
  return payload.access_token;
}

async function waitHttpReady() {
  await waitFor("API readiness", async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    return response.ok;
  });
}

function containerId(service) {
  return compose(["ps", "-q", service]);
}

async function waitHealthy(service) {
  await waitFor(`${service} health`, () => {
    const id = containerId(service);
    if (!id) return false;
    const state = run("docker", [
      "inspect", id, "--format",
      "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
    ]);
    return state === "running|healthy";
  });
}

async function waitWorkerPolling() {
  await waitFor("AI worker polling", () => {
    const id = containerId("ai-worker");
    if (!id) return false;
    const startedAt = run("docker", ["inspect", id, "--format", "{{.State.StartedAt}}"]).replace(/\.[0-9]+Z$/, "Z");
    const result = spawnSync("docker", ["logs", "--since", startedAt, id], {
      cwd: process.cwd(), encoding: "utf8",
    });
    if (result.status !== 0) return false;
    const logs = `${result.stdout}${result.stderr}`;
    return logs.includes('"event":"worker_polling","outcome":"healthy"');
  });
}

async function restart(service) {
  process.stdout.write(`Restarting ${service}...\n`);
  compose(["restart", service]);
  if (service === "api") await waitHttpReady();
  else if (service === "ai-worker") await waitWorkerPolling();
  else await waitHealthy(service);
}

async function killWorkerInFlight() {
  const previousId = containerId("ai-worker");
  assert.ok(previousId, "AI worker container must exist before kill");
  process.stdout.write("Killing the in-flight AI worker...\n");
  run("docker", ["kill", "--signal", "KILL", previousId]);
  compose(["up", "-d", "--no-deps", "--force-recreate", "ai-worker"]);
  await waitWorkerPolling();
  assert.notEqual(containerId("ai-worker"), previousId, "AI worker must be recreated after abrupt death");
}

async function ensureApprovalConfiguration(tokens) {
  const active = sql(`
    SELECT r.id || '|' || coalesce((
      SELECT p.effect FROM agentic_policies p
      WHERE p.revision_id=r.id AND p.actor_type='staff'
        AND p.resource='agentic.workflow' AND p.action='complete'
        AND p.purpose='store_health_review' AND p.data_classification='internal'
      ORDER BY p.rule_order LIMIT 1
    ), '')
    FROM agentic_configuration_revisions r WHERE r.state='active'
  `);
  if (active) {
    const [id, effect] = active.split("|");
    assert.equal(effect, "REQUIRE_APPROVAL", "Active local configuration must require workflow approval");
    return id;
  }

  const emptyChildren = {
    policies: [], toolGrants: [], modelConfigurations: [], budgetLimits: [],
  };
  const revision = await request("/v1/admin/agentic/configuration-revisions", {
    token: tokens.creator, method: "POST", body: { children: emptyChildren }, statuses: [201],
  });
  created.revisionId = revision.id;
  created.ownsRevision = true;
  const policy = {
    id: randomUUID(),
    revisionId: revision.id,
    ruleOrder: 1,
    effect: "REQUIRE_APPROVAL",
    actorType: "staff",
    resource: "agentic.workflow",
    action: "complete",
    purpose: "store_health_review",
    dataClassification: "internal",
    reasonCode: "WORKFLOW_REQUIRES_APPROVAL",
  };
  await request(`/v1/admin/agentic/configuration-revisions/${revision.id}`, {
    token: tokens.creator,
    method: "PATCH",
    body: { expectedVersion: 1, children: { ...emptyChildren, policies: [policy] } },
  });
  await request(`/v1/admin/agentic/configuration-revisions/${revision.id}/activate`, {
    token: tokens.creator, method: "POST", body: { expectedVersion: 2 },
  });
  return revision.id;
}

async function createRun(operator) {
  const marker = randomUUID();
  const task = await request("/v1/admin/agentic/tasks", {
    token: operator,
    method: "POST",
    statuses: [201],
    body: {
      goal: `Lifecycle store health review ${marker}`,
      instructions: "Exercise durable local workflow recovery boundaries.",
      provenance: {
        sourceType: "lifecycle_check",
        sourceId: marker,
        sourceDigest: createHash("sha256").update(marker).digest("hex"),
        classification: "internal",
      },
      subtasks: [{ agentKind: "catalog", title: "Review catalog health" }],
      dependencies: [],
    },
  });
  created.taskId = task.task.id;
  await request(`/v1/admin/agentic/tasks/${created.taskId}/ready`, {
    token: operator, method: "POST", body: { expectedVersion: 1 },
  });
  const workflow = await request(`/v1/admin/agentic/tasks/${created.taskId}/start`, {
    token: operator,
    method: "POST",
    body: { expectedVersion: 2, workflowVersion: 1 },
    statuses: [202],
  });
  created.runId = workflow.id;
  created.workflowId = workflow.temporalWorkflowId;
  return workflow;
}

async function getRun(operator) {
  return request(`/v1/admin/agentic/workflow-runs/${created.runId}`, { token: operator });
}

async function waitForReservedActivity() {
  created.killedInvocationKey = await waitFor("a reserved deterministic activity", () => {
    const key = sql(`SELECT invocation_key FROM agentic_activity_invocations WHERE workflow_run_id='${created.runId}' AND state='reserved' ORDER BY created_at LIMIT 1`);
    return key || undefined;
  });
}

async function waitForState(operator, state) {
  return waitFor(`workflow state ${state}`, async () => {
    const runState = await getRun(operator);
    return runState.state === state ? runState : undefined;
  }, 120_000);
}

async function approve(tokens) {
  const approval = await waitFor("bound workflow approval", async () => {
    const page = await request("/v1/admin/agentic/approvals?page=1&pageSize=100", {
      token: tokens.approver,
    });
    return page.items.find((item) => item.taskId === created.taskId && item.state === "pending");
  });
  await request(`/v1/admin/agentic/approvals/${approval.id}/decision`, {
    token: tokens.approver,
    method: "POST",
    statuses: [202],
    body: { expectedVersion: approval.version, decision: "approved", reason: "Lifecycle evidence reviewed" },
  });
}

async function verifyTerminal(operator) {
  const workflow = await waitFor("one completed workflow", async () => {
    const current = await getRun(operator);
    return terminalStates.has(current.state) ? current : undefined;
  }, 120_000);
  assert.equal(workflow.state, "completed", JSON.stringify(workflow));
  assert.equal(workflow.outcomeCode, "COMPLETED");

  const evidence = JSON.parse(sql(`
    SELECT json_build_object(
      'runs', (SELECT count(*) FROM agentic_workflow_runs WHERE task_id='${created.taskId}'),
      'completedRuns', (SELECT count(*) FROM agentic_workflow_runs WHERE task_id='${created.taskId}' AND state='completed' AND outcome_code='COMPLETED'),
      'invocations', (SELECT count(*) FROM agentic_activity_invocations WHERE workflow_run_id='${created.runId}'),
      'completedInvocations', (SELECT count(*) FROM agentic_activity_invocations WHERE workflow_run_id='${created.runId}' AND state='completed' AND safe_result IS NOT NULL),
      'distinctInvocations', (SELECT count(DISTINCT invocation_key) FROM agentic_activity_invocations WHERE workflow_run_id='${created.runId}'),
      'acceptedSignals', (SELECT count(*) FROM agentic_workflow_signal_receipts WHERE workflow_run_id='${created.runId}' AND signal_kind='approval' AND delivery_state='delivered' AND accepted=true)
    )
  `));
  assert.equal(Number(evidence.runs), 1);
  assert.equal(Number(evidence.completedRuns), 1);
  assert.ok(Number(evidence.invocations) >= 3, JSON.stringify(evidence));
  assert.equal(evidence.invocations, evidence.completedInvocations);
  assert.equal(evidence.invocations, evidence.distinctInvocations);
  assert.equal(Number(evidence.acceptedSignals), 1);
  assert.equal(
    Number(sql(`SELECT count(*) FROM agentic_activity_invocations WHERE invocation_key='${created.killedInvocationKey}' AND state='completed'`)),
    1,
    "The invocation interrupted by worker death must resume through its stable key",
  );

  const temporal = compose([
    "run", "--rm", "--no-deps", "temporal-cli", "workflow", "describe",
    "--namespace", "opendx", "--workflow-id", created.workflowId, "--output", "json",
  ]);
  const description = JSON.parse(temporal);
  assert.match(JSON.stringify(description), /COMPLETED|Completed/);
}

function assertDatabaseIsolation() {
  const forbidden = [
    ["opendx_local", "opendx_local_password", "temporal"],
    ["opendx_local", "opendx_local_password", "temporal_visibility"],
    ["opendx_local", "opendx_local_password", "postgres"],
    ["temporal", process.env.TEMPORAL_DB_PASSWORD ?? "temporal_local_password", "opendx"],
    ["temporal", process.env.TEMPORAL_DB_PASSWORD ?? "temporal_local_password", "opendx_test"],
    ["temporal", process.env.TEMPORAL_DB_PASSWORD ?? "temporal_local_password", "postgres"],
  ];
  for (const [user, password, database] of forbidden) {
    const result = spawnSync("docker", [
      ...composePrefix, "exec", "-T", "-e", `PGPASSWORD=${password}`, "postgres",
      "psql", "-h", "127.0.0.1", "-U", user, "-d", database, "-Atqc", "SELECT 1",
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.notEqual(result.status, 0, `${user} unexpectedly connected to ${database}`);
  }
}

async function cleanup() {
  let workflowId = created.workflowId;
  if (!workflowId && created.taskId) {
    await waitHealthy("postgres");
    workflowId = sql(`SELECT temporal_workflow_id FROM agentic_workflow_runs WHERE task_id='${created.taskId}' ORDER BY created_at LIMIT 1`) || undefined;
  }
  if (workflowId) {
    await waitHealthy("temporal");
    const describeArgs = [
      ...composePrefix, "run", "--rm", "--no-deps", "temporal-cli", "workflow", "describe",
      "--namespace", "opendx", "--workflow-id", workflowId,
    ];
    const description = spawnSync("docker", describeArgs, {
      cwd: process.cwd(), encoding: "utf8",
    });
    if (description.status === 0) {
      compose([
        "run", "--rm", "--no-deps", "temporal-cli", "workflow", "delete",
        "--namespace", "opendx", "--workflow-id", workflowId,
      ], { input: "y\n" });
      await waitFor("Temporal workflow deletion", () => {
        const result = spawnSync("docker", describeArgs, {
          cwd: process.cwd(), encoding: "utf8",
        });
        return result.status !== 0;
      });
    }
  }

  if (!created.taskId && !created.ownsRevision) return;
  await waitHealthy("postgres");
  const statements = ["BEGIN;", "SET LOCAL session_replication_role=replica;"];
  if (created.taskId) {
    statements.push(
      `DELETE FROM agentic_workflow_signal_receipts WHERE workflow_run_id IN (SELECT id FROM agentic_workflow_runs WHERE task_id='${created.taskId}');`,
      `DELETE FROM agentic_activity_invocations WHERE workflow_run_id IN (SELECT id FROM agentic_workflow_runs WHERE task_id='${created.taskId}');`,
      `DELETE FROM agentic_audit_events WHERE task_id='${created.taskId}';`,
      `DELETE FROM agentic_provenance_records WHERE task_id='${created.taskId}';`,
      `DELETE FROM agentic_approval_requests WHERE task_id='${created.taskId}';`,
      `DELETE FROM agentic_workflow_runs WHERE task_id='${created.taskId}';`,
      `DELETE FROM agentic_budget_entries WHERE task_id='${created.taskId}';`,
      `DELETE FROM agentic_subtask_dependencies WHERE task_id='${created.taskId}';`,
      `DELETE FROM agentic_subtasks WHERE task_id='${created.taskId}';`,
      `DELETE FROM agentic_tasks WHERE id='${created.taskId}';`,
    );
  }
  if (created.ownsRevision && created.revisionId) {
    statements.push(
      `DELETE FROM agentic_audit_events WHERE resource_type='configuration_revision' AND resource_id='${created.revisionId}';`,
      `DELETE FROM agentic_approval_requests WHERE configuration_revision_id='${created.revisionId}';`,
      `DELETE FROM agentic_configuration_revisions WHERE id='${created.revisionId}';`,
    );
  }
  statements.push("COMMIT;");
  compose([
    "exec", "-T", "postgres", "psql", "-X", "-U", "opendx_admin", "-d", "opendx",
    "-v", "ON_ERROR_STOP=1",
  ], { input: statements.join("\n") });
}

async function runLifecycle() {
  await waitHttpReady();
  await waitHealthy("ai-runtime");
  await waitHealthy("temporal");
  await waitHealthy("postgres");
  await waitWorkerPolling();
  assertDatabaseIsolation();

  const tokens = {
    operator: await token("agentic-operator@novacommerce.example", "opendx_agentic_operator_change_me"),
    approver: await token("agentic-approver@novacommerce.example", "opendx_agentic_approver_change_me"),
    creator: await token("agentic-governance-creator@novacommerce.example", "opendx_agentic_governance_creator_change_me"),
    reviewer: await token("agentic-governance-reviewer@novacommerce.example", "opendx_agentic_governance_reviewer_change_me"),
  };
  let failure;
  try {
    await ensureApprovalConfiguration(tokens);
    await createRun(tokens.operator);
    await waitForReservedActivity();
    await killWorkerInFlight();
    await waitForState(tokens.operator, "awaiting_human_approval");

    await restart("api");
    await restart("ai-runtime");
    await restart("temporal");
    await waitHealthy("ai-runtime");
    await waitWorkerPolling();
    await restart("postgres");
    await waitHealthy("temporal");
    await waitHealthy("ai-runtime");
    await waitHttpReady();
    await waitWorkerPolling();
    assertDatabaseIsolation();

    await approve(tokens);
    await verifyTerminal(tokens.operator);
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
  } catch (cleanupError) {
    if (!failure) failure = cleanupError;
    else process.stderr.write(`Cleanup also failed: ${cleanupError.stack ?? cleanupError}\n`);
  }
  if (failure) throw failure;
  process.stdout.write("Agentic workflow lifecycle check passed.\n");
}

async function main() {
  mkdirSync(maintenanceLockPath, { mode: 0o700 });
  writeFileSync(`${maintenanceLockPath}/owner`, String(process.pid), { mode: 0o600 });
  try {
    const lock = openSync(lifecycleLockPath, "wx", 0o600);
    writeFileSync(lock, String(process.pid));
    closeSync(lock);
    await runLifecycle();
  } finally {
    rmSync(lifecycleLockPath, { force: true });
    rmSync(`${maintenanceLockPath}/owner`, { force: true });
    rmdirSync(maintenanceLockPath);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
