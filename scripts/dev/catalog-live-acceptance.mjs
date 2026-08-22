// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const confirmation = "run-one-catalog";
const composeCommand = "docker compose";
const composePrefix = [
  "compose", ...(existsSync(".env") ? ["--env-file", ".env"] : []),
  "-f", "infra/docker/docker-compose.yml",
];

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", ...options });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function compose(args, options) {
  return run("docker", [...composePrefix, ...args], options);
}

function queryCatalogConfiguration() {
  const query = `SELECT json_build_object(
    'configurationRevisionId', config.revision_id,
    'primaryModel', config.primary_model,
    'fallbackModel', fallback.model
  ) FROM agentic_configuration_revisions revision
  JOIN agentic_model_configs config ON config.revision_id=revision.id AND config.agent_kind='catalog'
  JOIN agentic_model_fallbacks fallback ON fallback.revision_id=config.revision_id AND fallback.agent_kind=config.agent_kind AND fallback.position=1
  WHERE revision.state='active'`;
  const raw = compose(["exec", "-T", "postgres", "psql", "-X", "-U", "opendx_local", "-d", "opendx", "-Atqc", query]);
  if (!raw) fail("No active Catalog configuration with a fallback model exists.");
  return JSON.parse(raw);
}

function queryTaskProvenance(taskId) {
  const query = `SELECT id FROM agentic_provenance_records
    WHERE task_id='${taskId}'
    ORDER BY recorded_at ASC
    LIMIT 1`;
  const provenanceId = compose([
    "exec", "-T", "postgres", "psql", "-X", "-U", "opendx_local", "-d", "opendx",
    "-v", "ON_ERROR_STOP=1", "-Atqc", query,
  ]);
  if (!provenanceId) fail("The ready Catalog task has no persisted provenance record.");
  return provenanceId;
}

async function operatorToken() {
  const username = process.env.AGENTIC_LIVE_ACCEPTANCE_ADMIN_USERNAME ?? "admin@novacommerce.example";
  const password = process.env.KEYCLOAK_DEV_ADMIN_PASSWORD ?? process.env.KEYCLOAK_ADMIN_PASSWORD;
  const authority = process.env.AGENTIC_LIVE_ACCEPTANCE_KEYCLOAK_URL ?? process.env.KEYCLOAK_URL ?? "http://localhost:8080";
  if (!password) fail("Export KEYCLOAK_DEV_ADMIN_PASSWORD before running live acceptance.");
  const body = new URLSearchParams({ grant_type: "password", client_id: "opendx-lifecycle-check", username, password });
  const response = await fetch(`${authority}/realms/opendx/protocol/openid-connect/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json();
  if (!response.ok || typeof payload.access_token !== "string") fail("Could not obtain the local operator token.");
  return payload.access_token;
}

async function request(path, token, body) {
  const api = process.env.AGENTIC_LIVE_ACCEPTANCE_API_URL ?? "http://localhost:4000";
  const response = await fetch(`${api}${path}`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-correlation-id": randomUUID() }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || payload?.success !== true) fail(`API refused local acceptance preparation (${response.status}).`);
  return payload.data;
}

async function main() {
  if (process.env.OPENROUTER_LIVE_ACCEPTANCE_CONFIRM !== confirmation) fail("Set OPENROUTER_LIVE_ACCEPTANCE_CONFIRM=run-one-catalog.");
  if (!process.env.OPENROUTER_API_KEY) fail("Export the operator-owned OpenRouter credential from ignored .env first.");
  const config = queryCatalogConfiguration();
  const token = await operatorToken();
  const marker = randomUUID();
  const task = await request("/v1/admin/agentic/tasks", token, {
    goal: "One Catalog local live acceptance", instructions: "Run exactly one governed synthetic Catalog model generation.",
    provenance: { sourceType: "catalog_live_acceptance", sourceId: marker, sourceDigest: digest(marker), classification: "internal" },
    subtasks: [{ agentKind: "catalog", title: "Perform local Catalog live acceptance" }], dependencies: [],
  });
  const taskId = task.task.id;
  await request(`/v1/admin/agentic/tasks/${taskId}/ready`, token, { expectedVersion: 1 });
  const provenanceId = queryTaskProvenance(taskId);
  const command = {
    agentKind: "catalog", taskId, configurationRevisionId: config.configurationRevisionId,
    primaryModel: config.primaryModel, fallbackModel: config.fallbackModel,
    provenanceId,
    inputDigest: digest(`catalog-live-input:${taskId}`), idempotencyKey: digest(`catalog-live-run:${taskId}`),
  };
  compose(["build", "ai-worker"]);
  const output = compose([
    "run", "--rm", "--no-deps", "-T", "-e", "OPENROUTER_EXECUTION_ENABLED=true",
    "-e", `OPENROUTER_LIVE_ACCEPTANCE_CONFIRM=${confirmation}`, "ai-worker",
    "python", "-m", "app.agentic.cli.catalog_live_acceptance",
  ], { input: JSON.stringify(command) });
  const result = JSON.parse(output);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

await main();
