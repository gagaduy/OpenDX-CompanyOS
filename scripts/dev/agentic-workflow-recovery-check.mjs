#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, rmdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const composePrefix = [
  "compose",
  ...(existsSync(".env") ? ["--env-file", ".env"] : []),
  "-f", "infra/docker/docker-compose.yml",
];
const suffix = `_recovery_${process.pid}`;
const databases = {
  opendx: `opendx${suffix}`,
  temporal: `temporal${suffix}`,
  visibility: `temporal_visibility${suffix}`,
};
const containers = {
  temporal: `opendx-recovery-temporal-${process.pid}`,
  runtime: `opendx-recovery-runtime-${process.pid}`,
  api: `opendx-recovery-api-${process.pid}`,
  worker: `opendx-recovery-worker-${process.pid}`,
};
const apiBaseUrl = "http://127.0.0.1:14000";
const lockPath = "/tmp/opendx-agentic-workflow-recovery-check.lock";
const maintenanceLockPath = process.env.OPENDX_MAINTENANCE_LOCK_DIR
  ?? "/tmp/opendx-database-maintenance.lock";
const lockOwner = randomUUID();
const backupRoot = resolve("infra/backups");
const historyPath = `/tmp/opendx-recovery-history-${process.pid}.json`;
let recoverySet;
let taskId;
let runId;
let workflowId;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(), encoding: "utf8", ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout.trim();
}

function compose(args, options = {}) {
  return run("docker", [...composePrefix, ...args], options);
}

function sql(database, query, user = "opendx_admin") {
  return compose([
    "exec", "-T", "postgres", "psql", "-X", "-U", user, "-d", database,
    "-v", "ON_ERROR_STOP=1", "-Atqc", query,
  ]);
}

async function waitFor(description, operation, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value !== undefined && value !== false) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
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
    grant_type: "password", client_id: "opendx-lifecycle-check", username, password,
  });
  const response = await fetch(
    "http://127.0.0.1:8080/realms/opendx/protocol/openid-connect/token",
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
  );
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload.access_token;
}

function createDatabases() {
  for (const database of Object.values(databases)) {
    sql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  }
  sql("postgres", `CREATE DATABASE ${databases.opendx} OWNER opendx_local`);
  sql("postgres", `CREATE DATABASE ${databases.temporal} OWNER temporal`);
  sql("postgres", `CREATE DATABASE ${databases.visibility} OWNER temporal`);
  compose([
    "run", "--rm", "--no-deps",
    "-e", `DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/${databases.opendx}`,
    "migrate",
  ]);
  compose([
    "run", "--rm", "--no-deps",
    "-e", `TEMPORAL_DB_NAME=${databases.temporal}`,
    "-e", `TEMPORAL_VISIBILITY_DB_NAME=${databases.visibility}`,
    "temporal-schema",
  ]);
}

function startRecoveryStack() {
  compose([
    "run", "--no-deps", "-d", "--name", containers.temporal,
    "-e", `DBNAME=${databases.temporal}`,
    "-e", `VISIBILITY_DBNAME=${databases.visibility}`,
    "temporal",
  ]);
  compose([
    "run", "--rm", "--no-deps",
    "-e", `TEMPORAL_ADDRESS=${containers.temporal}:7233`,
    "temporal-namespace",
  ]);
  compose([
    "run", "--no-deps", "-d", "--name", containers.runtime,
    "-p", "127.0.0.1:18000:8000",
    "-e", `TEMPORAL_ADDRESS=${containers.temporal}:7233`,
    "ai-runtime",
  ]);
  compose([
    "run", "--no-deps", "-d", "--name", containers.api,
    "-p", "127.0.0.1:14000:4000",
    "-e", `DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/${databases.opendx}`,
    "-e", `AI_RUNTIME_INTERNAL_URL=http://${containers.runtime}:8000`,
    "api",
  ]);
  compose([
    "run", "--no-deps", "-d", "--name", containers.worker,
    "-e", `TEMPORAL_ADDRESS=${containers.temporal}:7233`,
    "-e", `AGENTIC_API_BASE_URL=http://${containers.api}:4000/v1/internal/agentic`,
    "ai-worker",
  ]);
}

async function waitReady() {
  await waitFor("recovery API readiness", async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    return response.ok;
  });
  await waitFor("recovery worker poller", () => {
    const logs = spawnSync("docker", ["logs", containers.worker], { encoding: "utf8" });
    return `${logs.stdout}${logs.stderr}`.includes('"event":"worker_polling","outcome":"healthy"');
  });
}

function stopRecoveryStack() {
  for (const [name, timeout] of [
    [containers.worker, "35"],
    [containers.api, "10"],
    [containers.runtime, "10"],
    [containers.temporal, "10"],
  ]) {
    run("docker", ["stop", "-t", timeout, name]);
    const state = run("docker", ["inspect", name, "--format", "{{.State.Status}}"]).trim();
    assert.notEqual(state, "running", `${name} is still polling during the recovery window`);
  }
}

function removeRecoveryStack() {
  for (const name of Object.values(containers)) {
    spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
  }
}

async function ensureApprovalConfiguration(tokens) {
  const active = sql(databases.opendx, `
    SELECT r.id || '|' || coalesce((SELECT p.effect FROM agentic_policies p
      WHERE p.revision_id=r.id AND p.actor_type='staff'
        AND p.resource='agentic.workflow' AND p.action='complete'
        AND p.purpose='store_health_review' AND p.data_classification='internal'
      ORDER BY p.rule_order LIMIT 1), '')
    FROM agentic_configuration_revisions r WHERE r.state='active'
  `, "opendx_local");
  if (active) {
    assert.equal(active.split("|")[1], "REQUIRE_APPROVAL");
    return;
  }
  const emptyChildren = { policies: [], toolGrants: [], modelConfigurations: [], budgetLimits: [] };
  const revision = await request("/v1/admin/agentic/configuration-revisions", {
    token: tokens.creator, method: "POST", body: { children: emptyChildren }, statuses: [201],
  });
  const policy = {
    id: randomUUID(), revisionId: revision.id, ruleOrder: 1, effect: "REQUIRE_APPROVAL",
    actorType: "staff", resource: "agentic.workflow", action: "complete",
    purpose: "store_health_review", dataClassification: "internal",
    reasonCode: "WORKFLOW_REQUIRES_APPROVAL",
  };
  await request(`/v1/admin/agentic/configuration-revisions/${revision.id}`, {
    token: tokens.creator, method: "PATCH",
    body: { expectedVersion: 1, children: { ...emptyChildren, policies: [policy] } },
  });
  await request(`/v1/admin/agentic/configuration-revisions/${revision.id}/submit`, {
    token: tokens.creator, method: "POST", body: { expectedVersion: 2 },
  });
  await request(`/v1/admin/agentic/configuration-revisions/${revision.id}/decision`, {
    token: tokens.reviewer, method: "POST", body: { expectedVersion: 3, decision: "activate" },
  });
}

async function createWaitingRun(operator) {
  const marker = randomUUID();
  const task = await request("/v1/admin/agentic/tasks", {
    token: operator, method: "POST", statuses: [201],
    body: {
      goal: `Recovery store health review ${marker}`,
      instructions: "Prove recovery-set resume from a bound approval.",
      provenance: {
        sourceType: "recovery_check", sourceId: marker,
        sourceDigest: createHash("sha256").update(marker).digest("hex"),
        classification: "internal",
      },
      subtasks: [{ agentKind: "catalog", title: "Review catalog health" }], dependencies: [],
    },
  });
  taskId = task.task.id;
  await request(`/v1/admin/agentic/tasks/${taskId}/ready`, {
    token: operator, method: "POST", body: { expectedVersion: 1 },
  });
  const workflow = await request(`/v1/admin/agentic/tasks/${taskId}/start`, {
    token: operator, method: "POST", statuses: [202],
    body: { expectedVersion: 2, workflowVersion: 1 },
  });
  runId = workflow.id;
  workflowId = workflow.temporalWorkflowId;
  await waitFor("workflow awaiting bound approval", async () => {
    const current = await request(`/v1/admin/agentic/workflow-runs/${runId}`, { token: operator });
    return current.state === "awaiting_human_approval";
  });
}

function createRecoverySet() {
  const before = new Set(readdirSync(backupRoot));
  run(resolve("scripts/ops/postgres-backup.sh"), [], {
    env: {
      ...process.env,
      BACKUP_DIR: backupRoot,
      COMPOSE_FILE: resolve("infra/docker/docker-compose.yml"),
      OPENDX_DEPLOYMENT_MODE: "local",
      RECOVERY_DATABASE_SUFFIX: suffix,
      RECOVERY_SERVICES_QUIESCED: "1",
      AGENTIC_RECOVERY_LOCK_OWNER: lockOwner,
      OPENDX_MAINTENANCE_LOCK_OWNER: lockOwner,
    },
  });
  const created = readdirSync(backupRoot).filter((name) => name.startsWith("recovery-") && !before.has(name));
  assert.equal(created.length, 1, `Expected one recovery set, got ${created.join(",")}`);
  recoverySet = join(backupRoot, created[0]);
}

function destroyAndRestoreDatabases() {
  for (const database of Object.values(databases)) {
    sql("postgres", `DROP DATABASE ${database} WITH (FORCE)`);
  }
  run(resolve("scripts/ops/postgres-restore.sh"), [], {
    env: {
      ...process.env,
      BACKUP: recoverySet,
      COMPOSE_FILE: resolve("infra/docker/docker-compose.yml"),
      OPENDX_DEPLOYMENT_MODE: "local",
      RECOVERY_DATABASE_SUFFIX: suffix,
      RECOVERY_SERVICES_QUIESCED: "1",
      AGENTIC_RECOVERY_LOCK_OWNER: lockOwner,
      OPENDX_MAINTENANCE_LOCK_OWNER: lockOwner,
    },
  });
}

async function approveAndVerify(tokens) {
  const approval = await waitFor("restored pending approval", async () => {
    const page = await request("/v1/admin/agentic/approvals?page=1&pageSize=100", { token: tokens.approver });
    return page.items.find((item) => item.taskId === taskId && item.state === "pending");
  });
  await request(`/v1/admin/agentic/approvals/${approval.id}/decision`, {
    token: tokens.approver, method: "POST", statuses: [202],
    body: { expectedVersion: approval.version, decision: "approved", reason: "Recovery evidence reviewed" },
  });
  const terminal = await waitFor("restored workflow completion", async () => {
    const current = await request(`/v1/admin/agentic/workflow-runs/${runId}`, { token: tokens.operator });
    return current.state === "completed" ? current : undefined;
  });
  assert.equal(terminal.outcomeCode, "COMPLETED");
  const evidence = JSON.parse(sql(databases.opendx, `SELECT json_build_object(
    'runs', (SELECT count(*) FROM agentic_workflow_runs WHERE task_id='${taskId}'),
    'receipts', (SELECT count(*) FROM agentic_workflow_signal_receipts WHERE workflow_run_id='${runId}' AND accepted=true),
    'invocations', (SELECT count(*) FROM agentic_activity_invocations WHERE workflow_run_id='${runId}'),
    'results', (SELECT count(*) FROM agentic_activity_invocations WHERE workflow_run_id='${runId}' AND state='completed' AND safe_result IS NOT NULL),
    'distinctInvocations', (SELECT count(DISTINCT invocation_key) FROM agentic_activity_invocations WHERE workflow_run_id='${runId}')
  )`, "opendx_local"));
  assert.equal(Number(evidence.runs), 1);
  assert.equal(Number(evidence.receipts), 1);
  assert.ok(Number(evidence.invocations) >= 3, JSON.stringify(evidence));
  assert.equal(evidence.invocations, evidence.results);
  assert.equal(evidence.invocations, evidence.distinctInvocations);
  const description = compose([
    "run", "--rm", "--no-deps", "--entrypoint", "temporal", "temporal-cli",
    "--address", `${containers.temporal}:7233`, "workflow", "describe",
    "--namespace", "opendx", "--workflow-id", workflowId, "--output", "json",
  ]);
  assert.match(description, /COMPLETED|Completed/);
  const history = compose([
    "run", "--rm", "--no-deps", "--entrypoint", "temporal", "temporal-cli",
    "--address", `${containers.temporal}:7233`, "workflow", "show",
    "--namespace", "opendx", "--workflow-id", workflowId, "--output", "json",
  ]);
  writeFileSync(historyPath, history);
  compose([
    "run", "--rm", "--no-deps", "-v", `${historyPath}:/tmp/history.json:ro`,
    "ai-runtime", "python", "-c",
    [
      "import asyncio",
      "from pathlib import Path",
      "from temporalio.client import WorkflowHistory",
      "from temporalio.worker import Replayer",
      "from app.agentic.workflows.store_health_review_v1 import StoreHealthReviewWorkflowV1",
      `history = WorkflowHistory.from_json(${JSON.stringify(workflowId)}, Path('/tmp/history.json').read_text())`,
      "asyncio.run(Replayer(workflows=[StoreHealthReviewWorkflowV1]).replay_workflow(history))",
    ].join("; "),
  ]);
}

function cleanup() {
  removeRecoveryStack();
  try {
    for (const database of Object.values(databases)) {
      sql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    }
  } catch (error) {
    process.stderr.write(`Recovery database cleanup failed: ${error.message}\n`);
  }
  if (recoverySet) rmSync(recoverySet, { recursive: true, force: true });
  rmSync(historyPath, { force: true });
  rmSync(lockPath, { force: true });
  rmSync(`${maintenanceLockPath}/owner`, { force: true });
  rmdirSync(maintenanceLockPath);
}

async function main() {
  mkdirSync(maintenanceLockPath, { mode: 0o700 });
  writeFileSync(`${maintenanceLockPath}/owner`, lockOwner, { mode: 0o600 });
  let failure;
  try {
    const lock = openSync(lockPath, "wx", 0o600);
    writeFileSync(lock, lockOwner);
    closeSync(lock);
    createDatabases();
    startRecoveryStack();
    await waitReady();
    const tokens = {
      operator: await token("agentic-operator@novacommerce.example", "opendx_agentic_operator_change_me"),
      approver: await token("agentic-approver@novacommerce.example", "opendx_agentic_approver_change_me"),
      creator: await token("agentic-governance-creator@novacommerce.example", "opendx_agentic_governance_creator_change_me"),
      reviewer: await token("agentic-governance-reviewer@novacommerce.example", "opendx_agentic_governance_reviewer_change_me"),
    };
    await ensureApprovalConfiguration(tokens);
    await createWaitingRun(tokens.operator);
    stopRecoveryStack();
    createRecoverySet();
    destroyAndRestoreDatabases();
    removeRecoveryStack();
    startRecoveryStack();
    await waitReady();
    await approveAndVerify(tokens);
  } catch (error) {
    failure = error;
  }
  cleanup();
  if (failure) throw failure;
  process.stdout.write("Agentic workflow recovery-set check passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
