// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAgenticPhaseF,
  validateAgenticPhaseF,
  validateDepartmentSecrets,
} from "./agentic-phase-f-orchestration-check.mjs";

test("phase F gate rejects shared Department credentials", () => {
  assert.throws(
    () => validateDepartmentSecrets({
      catalog: "shared-secret", inventory: "shared-secret",
      order: "order-secret-1", finance: "finance-secret-1",
      crm: "crm-secret-123", support: "support-secret-1",
    }),
    /distinct/,
  );
});

test("phase F snapshot includes identity, replay, and documentation gates", () => {
  assert.doesNotThrow(() => validateAgenticPhaseF(collectAgenticPhaseF()));
});

test("phase F snapshot rejects duplicate execution identities", () => {
  const snapshot = collectAgenticPhaseF();
  const realm = JSON.parse(snapshot.localRealm);
  realm.clients.push(realm.clients.find((client) => client.clientId === "agent-ai-ceo"));
  snapshot.localRealm = JSON.stringify(realm);
  assert.throws(() => validateAgenticPhaseF(snapshot), /exactly one agent-ai-ceo/i);
});

test("phase F snapshot rejects a missing deterministic patch", () => {
  const snapshot = collectAgenticPhaseF();
  snapshot.workflow = snapshot.workflow.replace("phase-f-execution-descriptor-v1", "missing-patch");
  assert.throws(() => validateAgenticPhaseF(snapshot), /descriptor workflow patch/i);
});

test("phase F snapshot rejects a disconnected collaboration endpoint", () => {
  const snapshot = collectAgenticPhaseF();
  snapshot.departmentExecution = snapshot.departmentExecution.replace(
    "await self._controls.mediate_collaboration(", "await disconnected_collaboration(",
  );
  assert.throws(() => validateAgenticPhaseF(snapshot), /collaboration/i);
});
