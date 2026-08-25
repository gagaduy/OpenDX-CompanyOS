// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_TOKEN_ENVIRONMENT } from "./agentic-console-browser-check.mjs";
import { buildCommands, collectAgenticPhaseG, runExitCheck, validateAgenticPhaseG, validateEnvironment } from "./agentic-phase-g-exit-check.mjs";

test("Phase G owns the approved Console boundary", () => {
  const snapshot = collectAgenticPhaseG();
  assert.doesNotThrow(() => validateAgenticPhaseG(snapshot));
  assert.match(snapshot.router, /agentic\/tasks/);
  assert.match(snapshot.shell, /Digital Workforce/);
  assert.doesNotMatch(snapshot.router, /agentic\/memory/);
  assert.match(snapshot.apiRoutes, /tasks\/:taskId\/operations/);
  assert.match(snapshot.buildDocs, /check:agentic-phase-g-exit/);
});

test("fails closed without isolated database and browser role tokens", () => {
  assert.equal(validateEnvironment({}).ok, false);
  assert.equal(validateEnvironment({ TEST_DATABASE_URL: "postgres://prod", AGENTIC_PHASE_G_OPERATOR_TOKEN: "token" }).ok, false);
});

test("composes deterministic API, Console, Phase F, browser, audit, and diff gates", () => {
  const commands = buildCommands({ cwd: "/workspace", env: {} }).map(([command, args]) => `${command} ${args.join(" ")}`).join("\n");
  assert.match(commands, /agentic-phase-f-orchestration/);
  assert.match(commands, /docker run --rm --network none/);
  assert.match(commands, /test_phase_f_acceptance_restarts_worker_replays_history_without_duplicate_effects/);
  assert.match(commands, /agentic-console-browser/);
  assert.match(commands, /src\/modules\/agentic --exclude \*\*\/\*\.integration\.test\.ts/);
  assert.match(commands, /vitest\.integration/);
  assert.match(commands, /vitest\.integration\.config\.ts --maxWorkers 1/);
  assert.match(commands, /audit:repo/);
  assert.match(commands, /git diff --check/);
});

test("builds and browses with one explicit non-secret Console environment", () => {
  const calls = [];
  const env = {
    TEST_DATABASE_URL: "postgresql://opendx_local:test@127.0.0.1:55432/opendx_test",
    AGENTIC_PHASE_G_CONSOLE_URL: "http://127.0.0.1:3011",
    AGENTIC_PHASE_G_OIDC_AUTHORITY: "http://127.0.0.1:8081/realms/opendx",
    ...Object.fromEntries(ROLE_TOKEN_ENVIRONMENT.map(({ name }) => [name, "fixture-token"])),
  };
  assert.equal(runExitCheck({ env, runCommand: (command, args, options) => { calls.push({ command, args, options }); return { status: 0 }; }, stdout: () => {}, stderr: () => {} }), 0);
  assert.equal(calls[0].options.env.VITE_OIDC_AUTHORITY, env.AGENTIC_PHASE_G_OIDC_AUTHORITY);
  assert.equal(calls[0].options.env.VITE_OIDC_REDIRECT_URI, `${env.AGENTIC_PHASE_G_CONSOLE_URL}/auth/callback`);
});
