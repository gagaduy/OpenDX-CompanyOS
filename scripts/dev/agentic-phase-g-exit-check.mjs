#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROLE_TOKEN_ENVIRONMENT, validateBrowserEnvironment } from "./agentic-console-browser-check.mjs";

const source = (path) => readFileSync(path, "utf8");
const invariant = (value, message) => { if (!value) throw new Error(message); };

export function collectAgenticPhaseG() {
  return {
    router: source("apps/console/src/app/app-router.tsx"), shell: source("apps/console/src/app/console-shell.tsx"),
    apiClient: source("apps/console/src/features/agentic/api/agentic-api.ts"), schemas: source("apps/console/src/features/agentic/schemas/agentic-task-api.schema.ts") + source("apps/console/src/features/agentic/schemas/agentic-approval-api.schema.ts") + source("apps/console/src/features/agentic/schemas/agentic-workforce-api.schema.ts"),
    apiRoutes: source("apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts"), consoleService: source("apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts"),
    idempotency: source("apps/api/src/modules/agentic/infrastructure/database/migrations/202608250009_create_agentic_staff_intake_idempotency.ts"),
    browser: source("scripts/dev/agentic-console-browser-check.mjs"), apiDocs: source("docs/api/agentic.md"), buildDocs: source("docs/build-from-source.md"),
    roadmap: source("docs/roadmap/mvp-status.md"), readme: source("README.md"), packageJson: source("package.json"),
  };
}

export function validateAgenticPhaseG(snapshot) {
  for (const path of ["tasks", "approvals", "employees", "audit"]) invariant(snapshot.router.includes(`/agentic/${path}`), `Missing Console route ${path}`);
  invariant(!snapshot.router.includes("/agentic/memory"), "Company Memory must remain outside Phase G");
  invariant(snapshot.shell.includes("Digital Workforce") && snapshot.shell.includes("Employees") && snapshot.shell.includes("Audit"), "Digital Workforce navigation is incomplete");
  for (const route of ["tasks/overview", "tasks/:taskId/operations", "approvals/:approvalId/detail", "employees/:agentKind", "/audit"]) invariant(snapshot.apiRoutes.includes(route), `Missing staff API route ${route}`);
  invariant(snapshot.apiClient.includes("parse(agentic") && snapshot.schemas.includes(".strict()"), "Console payloads must remain runtime validated");
  invariant(snapshot.idempotency.includes("actor_id") && snapshot.idempotency.includes("request_digest"), "Actor-bound intake idempotency is missing");
  invariant(snapshot.consoleService.includes("getConsoleTaskOperations") && snapshot.consoleService.includes("listConsoleAudit"), "Authoritative operations or audit projection is missing");
  invariant(snapshot.browser.includes("390") && snapshot.browser.includes("768") && snapshot.browser.includes("1440") && snapshot.browser.includes("catalog_manager"), "Responsive role-denial browser acceptance is incomplete");
  invariant(snapshot.apiDocs.includes("Console Digital Workforce staff routes") && snapshot.buildDocs.includes("check:agentic-phase-g-exit"), "Phase G API or build documentation is incomplete");
  invariant(snapshot.packageJson.includes('"check:agentic-phase-g-exit"') && snapshot.packageJson.includes('"check:agentic-console-browser"'), "Phase G commands are missing");
  invariant(snapshot.roadmap.includes("Phase G: Console Digital Workforce") && snapshot.readme.includes("Digital Workforce Console"), "Public Phase G status is incomplete");
}

export function validateEnvironment(env) {
  const browser = validateBrowserEnvironment(env);
  const database = env.TEST_DATABASE_URL;
  const databaseSafe = typeof database === "string" && /localhost|127\.0\.0\.1/.test(database) && /opendx_test/.test(database);
  const consoleSafe = typeof (env.AGENTIC_PHASE_G_CONSOLE_URL ?? env.CONSOLE_URL) === "string";
  const missing = [...(browser.ok ? [] : browser.missing), ...(database ? [] : ["TEST_DATABASE_URL"]), ...(consoleSafe ? [] : ["AGENTIC_PHASE_G_CONSOLE_URL"])];
  return missing.length === 0 && databaseSafe ? { ok: true } : { ok: false, missing, unsafe: database && !databaseSafe ? ["TEST_DATABASE_URL"] : [] };
}

export function buildCommands({ cwd = process.cwd(), env = process.env } = {}) {
  const temporalServer = env.AGENTIC_PHASE_G_TEMPORAL_TEST_SERVER ?? "/tmp/temporal-test-server-sdk-python-1.30.0";
  const pythonGateImage = env.AGENTIC_PHASE_G_PYTHON_GATE_IMAGE ?? "opendx-ai-runtime-checks:latest";
  const aiRuntime = resolve(cwd, "services/ai-runtime");
  return [
    ["pnpm", ["--filter", "@opendx/api", "exec", "vitest", "run", "src/modules/agentic", "--exclude", "**/*.integration.test.ts"]],
    ["pnpm", ["--filter", "@opendx/api", "exec", "vitest", "run", "--config", "vitest.integration.config.ts", "--maxWorkers", "1", "src/modules/agentic/tests/agentic.api.integration.test.ts", "src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts"]],
    ["pnpm", ["--filter", "@opendx/console", "test"]],
    ["pnpm", ["--filter", "@opendx/console", "build"]],
    ["node", ["--test", "scripts/dev/agentic-phase-f-orchestration-check.test.mjs"]],
    ["docker", ["run", "--rm", "--network", "none", "-v", `${aiRuntime}:/workspace/services/ai-runtime:ro`, "-v", `${temporalServer}:${temporalServer}:ro`, "-w", "/workspace/services/ai-runtime", pythonGateImage, "python", "-m", "pytest", "tests/agentic/workflows/test_store_health_orchestration.py::test_phase_f_acceptance_restarts_worker_replays_history_without_duplicate_effects"]],
    ["pnpm", ["check:agentic-console-browser"]],
    ["pnpm", ["audit:repo"]],
    ["git", ["diff", "--check"]],
  ];
}

export function runExitCheck({ env = process.env, cwd = process.cwd(), runCommand = spawnSync, stdout = console.log, stderr = console.error } = {}) {
  validateAgenticPhaseG(collectAgenticPhaseG()); const environment = validateEnvironment(env);
  if (!environment.ok) { stderr("Phase G exit requires isolated PostgreSQL, a running Console, and five environment-provided role tokens."); for (const name of environment.missing) stderr(`Missing ${name}`); for (const name of environment.unsafe) stderr(`Unsafe ${name}`); return 2; }
  const evidence = env.AGENTIC_PHASE_G_EVIDENCE_DIR ?? "/tmp/opendx-agentic-phase-g-exit"; stdout(`Phase G redacted evidence directory: ${evidence}`);
  const consoleUrl = (env.AGENTIC_PHASE_G_CONSOLE_URL ?? env.CONSOLE_URL).replace(/\/$/, "");
  const oidcAuthority = env.AGENTIC_PHASE_G_OIDC_AUTHORITY ?? env.VITE_OIDC_AUTHORITY ?? "http://localhost:8080/realms/opendx";
  const gateEnv = { ...env, AGENTIC_PHASE_G_CONSOLE_URL: consoleUrl, AGENTIC_PHASE_G_OIDC_AUTHORITY: oidcAuthority, AGENTIC_PHASE_G_EVIDENCE_DIR: evidence, VITE_API_BASE_URL: env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000", VITE_OIDC_AUTHORITY: oidcAuthority, VITE_OIDC_CLIENT_ID: env.VITE_OIDC_CLIENT_ID ?? "opendx-console", VITE_OIDC_REDIRECT_URI: env.VITE_OIDC_REDIRECT_URI ?? `${consoleUrl}/auth/callback`, VITE_OIDC_POST_LOGOUT_REDIRECT_URI: env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? `${consoleUrl}/sign-in` };
  for (const [command, args] of buildCommands({ cwd, env: gateEnv })) { stdout(`Running ${command} ${args.join(" ")}`); const result = runCommand(command, args, { cwd, env: gateEnv, stdio: "inherit" }); if (result.status !== 0) { stderr(`Command failed: ${command} ${args.join(" ")}`); return result.status ?? 1; } }
  stdout(`Phase G exit passed for ${ROLE_TOKEN_ENVIRONMENT.length} roles.`); return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(runExitCheck());
