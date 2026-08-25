#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = (path) => readFileSync(path, "utf8");
export function collectAgenticPhaseE() { return { api: source("docs/api/agentic.md"), service: source("apps/api/src/modules/agentic/application/services/implementations/agentic-file.service.ts"), scanner: source("apps/api/src/modules/agentic/infrastructure/security/clamd-agentic-file.scanner.ts"), storage: source("apps/api/src/modules/agentic/infrastructure/storage/minio-agentic-file.storage.ts"), rules: source("apps/api/src/modules/agentic/domain/services/agentic-file-rules.ts"), routes: source("apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts") }; }
export function validateAgenticPhaseE(s) {
  const privateApi = /private\s+staff\s+APIs/i.test(s.api) && /neither\s+file\s+bytes,\s+storage\s+keys,\s+public\s+URLs/i.test(s.api);
  const opaqueKeyBoundary = s.service.includes("agentic-intake/") && /agentic-intake\\\//.test(s.storage);
  if (!opaqueKeyBoundary || !privateApi) throw new Error("Phase E storage must remain private");
  if (!s.scanner.includes("FILE_SCAN_FAILED") || !s.service.includes("FILE_CONTENT_INVALID")) throw new Error("Phase E must fail closed for scanner and hostile content");
  if (!s.rules.includes("maxRows") || !s.rules.includes("maxFileBytes") || !s.routes.includes("multer.memoryStorage()") || !s.routes.includes(".single(\"file\")")) throw new Error("Phase E must keep bounded CSV/TXT intake");
  if (!s.api.includes("/:fileId/approve")) throw new Error("Phase E must bind preview approval to one task");
}
async function live() {
  const url = process.env.AGENTIC_PHASE_E_API_URL; const token = process.env.AGENTIC_PHASE_E_BEARER_TOKEN;
  if (!url || !token) throw new Error("Phase E live acceptance requires AGENTIC_PHASE_E_API_URL and AGENTIC_PHASE_E_BEARER_TOKEN (authorized governance-admin stack with PostgreSQL, private MinIO, and ClamAV)");
  const response = await fetch(`${url.replace(/\/$/, "")}/health/ready`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Phase E stack readiness failed: HTTP ${response.status}`);
  const base = `${url.replace(/\/$/, "")}/v1/admin/agentic/files`;
  for (const [name, type, body] of [["phase-e-clean.csv", "text/csv", "name,quantity\nwidget,1\n"], ["phase-e-clean.txt", "text/plain", "review this bounded evidence\n"]]) await approveExactlyOnce(base, token, name, type, body);
  await rejectedUpload(base, token, "phase-e-unsupported.pdf", "application/pdf", "not a PDF");
  await rejectedUpload(base, token, "phase-e-invalid.csv", "text/csv", "bad\0content");
  await rejectedUpload(base, token, "phase-e-oversized.csv", "text/csv", "x".repeat(2 * 1024 * 1024 + 1));
  // Infection and scanner-outage proof require a controlled ClamAV test stack; the public API intentionally has no unsafe simulation switch.
  if (process.env.AGENTIC_PHASE_E_CLAMAV_CONTROLLED !== "true") throw new Error("Phase E requires AGENTIC_PHASE_E_CLAMAV_CONTROLLED=true after controlled infected and scanner-unavailable integration vectors pass");
}
async function request(url, token, init = {}) { const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }); const body = await r.json().catch(() => ({})); return { r, body }; }
async function upload(base, token, name, type, value, idempotencyKey = `phase-e-upload-${crypto.randomUUID()}`) { const form = new FormData(); form.set("file", new Blob([value], { type }), name); return request(base, token, { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: form }); }
async function approveExactlyOnce(base, token, name, type, value) { const uploadKey = `phase-e-upload-${crypto.randomUUID()}`; const uploaded = await upload(base, token, name, type, value, uploadKey); if (uploaded.r.status !== 201 || uploaded.body.data?.objectKey !== undefined) throw new Error("Phase E clean upload must return private metadata only"); const replayedUpload = await upload(base, token, name, type, value, uploadKey); if (replayedUpload.r.status !== 200 || replayedUpload.body.data?.id !== uploaded.body.data?.id) throw new Error("Phase E upload replay must resolve to the original private file"); const id = uploaded.body.data?.id; const preview = await request(`${base}/${id}/preview`, token); if (!preview.r.ok || !preview.body.data?.payloadDigest) throw new Error("Phase E clean upload must produce bounded preview"); const input = { expectedFileVersion: preview.body.data.fileVersion, previewVersion: preview.body.data.previewVersion, previewPayloadDigest: preview.body.data.payloadDigest }; const key = `phase-e-${id}`; const first = await request(`${base}/${id}/approve`, token, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(input) }); const replay = await request(`${base}/${id}/approve`, token, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(input) }); if (first.body.data?.task?.state !== "draft" || first.body.data?.task?.id !== replay.body.data?.task?.id) throw new Error("Phase E approval must create exactly one draft task"); }
async function rejectedUpload(base, token, name, type, value) { const result = await upload(base, token, name, type, value); if (result.r.ok) throw new Error(`Phase E rejected upload unexpectedly succeeded: ${name}`); }
export async function run() { validateAgenticPhaseE(collectAgenticPhaseE()); await live(); console.info("Agentic Phase E exit check passed."); }
if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
