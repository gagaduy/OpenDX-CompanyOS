// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { APPROVED_ROUTES, ROLE_TOKEN_ENVIRONMENT, VIEWPORTS, assertSafeEvidenceDirectory, buildFixtures, validateBrowserEnvironment } from "./agentic-console-browser-check.mjs";

test("covers every approved route, workforce role, and responsive viewport", () => {
  assert.deepEqual(VIEWPORTS.map(({ width, height }) => `${width}x${height}`), ["390x844", "768x1024", "1440x900"]);
  assert.deepEqual(ROLE_TOKEN_ENVIRONMENT.map(({ role }) => role), ["agentic_operator", "agentic_governance_admin", "agentic_approver", "agentic_auditor", "catalog_manager"]);
  assert.deepEqual(APPROVED_ROUTES.map(({ path }) => path), ["/agentic/tasks", "/agentic/tasks/new", "/agentic/tasks/00000000-0000-4000-8000-000000000001", "/agentic/approvals", "/agentic/employees", "/agentic/employees/inventory", "/agentic/audit"]);
});

test("keeps evidence in a redacted Phase G temporary directory", () => {
  assert.doesNotThrow(() => assertSafeEvidenceDirectory("/tmp/opendx-agentic-phase-g-run"));
  assert.throws(() => assertSafeEvidenceDirectory("./evidence"), /temporary/i);
});

test("requires role tokens and exposes only bounded deterministic fixtures", () => {
  assert.equal(validateBrowserEnvironment({}).ok, false);
  const fixtures = JSON.stringify(buildFixtures());
  assert.doesNotMatch(fixtures, /rawPrompt|providerBody|clientSecret|access_token/i);
  assert.equal(buildFixtures().operations.data.branches.length, 6);
});
