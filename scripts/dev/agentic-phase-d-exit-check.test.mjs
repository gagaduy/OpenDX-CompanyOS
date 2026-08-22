// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { collectAgenticPhaseDSnapshot, validateAgenticPhaseD } from "./agentic-phase-d-exit-check.mjs";

test("accepts Phase D implementation without Phase F routing", () => {
  assert.doesNotThrow(() => validateAgenticPhaseD(collectAgenticPhaseDSnapshot()));
});

test("rejects model output exposure and CEO delegation", () => {
  const snapshot = structuredClone(collectAgenticPhaseDSnapshot());
  snapshot.activity += '\nreturn {"content": output}';
  assert.throws(() => validateAgenticPhaseD(snapshot), /digest-only/i);
  const delegation = structuredClone(collectAgenticPhaseDSnapshot());
  delegation.runtime += "\nasync def delegate_to_department(): pass";
  assert.throws(() => validateAgenticPhaseD(delegation), /Phase F/i);
});
