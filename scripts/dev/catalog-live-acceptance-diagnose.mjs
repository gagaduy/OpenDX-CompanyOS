// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const composePrefix = [
  "compose", ...(existsSync(".env") ? ["--env-file", ".env"] : []),
  "-f", "infra/docker/docker-compose.yml",
];

function fail(message) {
  throw new Error(message);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) fail("The local read-only diagnostic could not query PostgreSQL.");
  return result.stdout.trim();
}

function readRun(runId) {
  const query = `SELECT json_build_object(
    'runId', run.id,
    'status', run.status,
    'errorCode', run.error_code,
    'settledCostMicros', run.settled_cost_micros,
    'provenanceCount', (SELECT count(*) FROM agentic_provenance_records provenance WHERE provenance.task_id=run.task_id),
    'auditEventCount', (SELECT count(*) FROM agentic_audit_events audit WHERE audit.resource_id=run.id::text)
  )
  FROM agentic_model_runs run
  WHERE run.id='${runId}'`;
  const raw = run("docker", [
    ...composePrefix, "exec", "-T", "postgres", "psql", "-X", "-U", "opendx_local",
    "-d", "opendx", "-v", "ON_ERROR_STOP=1", "-Atqc", query,
  ]);
  if (!raw) fail("No model run exists for the supplied run ID.");
  return JSON.parse(raw);
}

function categoryFor(errorCode) {
  if (errorCode === "OPENROUTER_AUTH_FAILED") return "credential_or_account";
  if (errorCode === "OPENROUTER_TRANSPORT_FAILED" || errorCode === "OPENROUTER_PROVIDER_RETRYABLE") return "transport";
  if (errorCode === "OPENROUTER_REQUEST_INVALID" || errorCode === "OPENROUTER_REQUEST_REJECTED" || errorCode === "OPENROUTER_SCHEMA_REJECTED") return "request_schema";
  if (errorCode === "OPENROUTER_RESPONSE_ENVELOPE_INVALID" || errorCode === "OPENROUTER_RESPONSE_CHOICES_INVALID" || errorCode === "OPENROUTER_RESPONSE_CONTENT_INVALID" || errorCode === "OPENROUTER_RESPONSE_CONTENT_ABSENT" || errorCode === "OPENROUTER_RESPONSE_CONTENT_JSON_INVALID" || errorCode === "OPENROUTER_RESPONSE_CONTENT_TYPE_INVALID") return "response_contract";
  if (errorCode === "OPENROUTER_MODEL_UNAVAILABLE" || errorCode === "OPENROUTER_RESPONSE_INVALID" || errorCode === "OPENROUTER_RESULT_INVALID") return "model_capability";
  return "provider_unknown";
}

function inputRunId(argumentsList) {
  const values = argumentsList[0] === "--" ? argumentsList.slice(1) : argumentsList;
  if (values.length !== 2 || values[0] !== "--run-id" || !uuid.test(values[1])) {
    fail("Usage: pnpm diagnose:catalog-live -- --run-id <uuid>");
  }
  return values[1].toLowerCase();
}

function main() {
  const runId = inputRunId(process.argv.slice(2));
  const result = readRun(runId);
  if (!["completed", "failed", "partial", "escalated"].includes(result.status)) {
    fail("The supplied model run is not terminal.");
  }
  process.stdout.write(`${JSON.stringify({ ...result, category: categoryFor(result.errorCode) })}\n`);
}

main();
