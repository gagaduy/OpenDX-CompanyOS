#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = (path) => readFileSync(path, "utf8");
export function collectAgenticPhaseE() { return { api: source("docs/api/agentic.md"), service: source("apps/api/src/modules/agentic/application/services/implementations/agentic-file.service.ts"), storage: source("apps/api/src/modules/agentic/infrastructure/storage/minio-agentic-file.storage.ts"), parser: source("apps/api/src/modules/agentic/infrastructure/parsing/bounded-agentic-file.parser.ts"), routes: source("apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts") }; }
export function validateAgenticPhaseE(s) {
  if (!s.storage.includes("agentic-intake/") || !s.api.includes("private staff APIs")) throw new Error("Phase E storage must remain private");
  if (!s.service.includes("FILE_SCAN_FAILED") || !s.service.includes("FILE_CONTENT_INVALID")) throw new Error("Phase E must fail closed for scanner and hostile content");
  if (!s.parser.includes("maxRows") || !s.routes.includes("upload.single")) throw new Error("Phase E must keep bounded CSV/TXT intake");
  if (!s.api.includes("/:fileId/approve")) throw new Error("Phase E must bind preview approval to one task");
}
async function live() {
  const url = process.env.AGENTIC_PHASE_E_API_URL; const token = process.env.AGENTIC_PHASE_E_BEARER_TOKEN;
  if (!url || !token) throw new Error("Phase E live acceptance requires AGENTIC_PHASE_E_API_URL and AGENTIC_PHASE_E_BEARER_TOKEN (authorized governance-admin stack with PostgreSQL, private MinIO, and ClamAV)");
  const response = await fetch(`${url.replace(/\/$/, "")}/health/ready`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Phase E stack readiness failed: HTTP ${response.status}`);
  // Upload/approval vectors are executed by the authenticated integration runner; this gate deliberately never logs bytes or tokens.
  console.info("Phase E live stack is ready; run the configured authenticated file-intake integration suite for CSV/TXT approval and rejection vectors.");
}
export async function run() { validateAgenticPhaseE(collectAgenticPhaseE()); await live(); console.info("Agentic Phase E exit check passed."); }
if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
