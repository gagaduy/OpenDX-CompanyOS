#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = (path) => readFileSync(path, "utf8");
export function collectAgenticPhaseDSnapshot() { return { activity: source("services/ai-runtime/app/agentic/activities/model_execution_activities.py"), runtime: source("services/ai-runtime/app/agentic/application/model_executor.py"), worker: source("services/ai-runtime/app/agentic/worker.py"), live: source("scripts/dev/openrouter-live-acceptance.py") }; }
export function validateAgenticPhaseD({ activity, runtime, worker, live }) {
  if (!activity.includes('"outputDigest": outcome.output_digest') || /"content"\s*:/.test(activity)) throw new Error("Phase D activity must remain digest-only");
  if (!runtime.includes("reserve_model_run") || !runtime.includes("complete_model_run")) throw new Error("API model-run authority is required");
  if (!worker.includes("execution_enabled") || !worker.includes("ModelExecutionActivities")) throw new Error("Worker must opt in to model execution");
  if (/delegate_to_department|department_routing/i.test(runtime + worker)) throw new Error("Phase F delegation is not started");
  if (!live.includes("OPENROUTER_API_KEY") || !live.includes("classification\": \"internal")) throw new Error("Mandatory live acceptance is missing");
}
export function run() { validateAgenticPhaseD(collectAgenticPhaseDSnapshot()); console.info("Agentic Phase D exit check passed."); }
if (process.argv[1] === fileURLToPath(import.meta.url)) run();
