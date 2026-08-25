// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { collectModelRuntimeSnapshot, validateModelRuntime } from "./agentic-model-runtime-check.mjs";

test("accepts the governed seven-Agent model runtime", () => {
  assert.doesNotThrow(() => validateModelRuntime(collectModelRuntimeSnapshot()));
});

test("rejects an unsafe response or missing Agent", () => {
  const snapshot = structuredClone(collectModelRuntimeSnapshot());
  snapshot.activity = snapshot.activity.replace('"outputDigest": outcome.output_digest', '"content": outcome.content');
  assert.throws(() => validateModelRuntime(snapshot), /digest-only/i);
  snapshot.runtime = snapshot.runtime.replace('"support"', '"removed"');
  assert.throws(() => validateModelRuntime(snapshot), /seven Agents/i);
});

test("rejects an expanded correction bound", () => {
  const snapshot = structuredClone(collectModelRuntimeSnapshot());
  snapshot.executor = snapshot.executor.replace(
    "maximum_correction_rounds: int = 2",
    "maximum_correction_rounds: int = 20",
  );
  assert.throws(() => validateModelRuntime(snapshot), /bounded/i);
});
