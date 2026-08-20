#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path) => readFileSync(path, "utf8");
export function collectModelRuntimeSnapshot() {
  return { runtime: source("services/ai-runtime/app/agentic/domain/model_runtime.py"), activity: source("services/ai-runtime/app/agentic/activities/model_execution_activities.py"), executor: source("services/ai-runtime/app/agentic/application/model_executor.py") };
}
export function validateModelRuntime({ runtime, activity, executor }) {
  for (const agent of ["ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"]) {
    if (!runtime.includes(`"${agent}"`)) throw new Error("Model runtime must retain seven Agents");
  }
  if (!activity.includes('"outputDigest": outcome.output_digest') || /"content"\s*:/.test(activity)) throw new Error("Activity result must remain digest-only");
  if (!executor.includes("for correction_round in range(3)") || !executor.includes("fallback_position")) throw new Error("Model attempts must remain bounded");
}
export function run() {
  validateModelRuntime(collectModelRuntimeSnapshot());
  execFileSync("docker", ["build", "--target", "checks", "-t", "opendx-agentic-model-runtime-check", "-f", "services/ai-runtime/Dockerfile", "."], { stdio: "inherit" });
  execFileSync("docker", ["run", "--rm", "opendx-agentic-model-runtime-check"], { stdio: "inherit" });
  console.info("Agentic model runtime fake acceptance passed.");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) run();
