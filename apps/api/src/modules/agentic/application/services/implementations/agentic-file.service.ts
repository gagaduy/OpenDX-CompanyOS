// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { AgenticFileScanner } from "../../security/agentic-file-scanner";
import type { AgenticFileStorage } from "../../storage/agentic-file-storage";
import type { AgenticFileParser } from "../../parsing/agentic-file-parser";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { AgenticFilePreview, AgenticIntakeFile } from "../../../domain/entities/agentic-file";
import { AGENTIC_FILE_LIMITS, transitionAgenticIntakeFile, validateAgenticFileUpload } from "../../../domain/services/agentic-file-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type { AgenticFilePreviewDto, AgenticFileService, AgenticFileUploadRequest, AgenticFileUploadResult, ApproveAgenticFilePreviewRequest } from "../interfaces/agentic-file.service";

type FileRepository = Pick<AgenticRepository, "findStaffIntakeBinding" | "bindStaffIntake" | "createIntakeFile" | "findIntakeFile" | "transitionIntakeFile" | "appendFilePreview" | "findFilePreview" | "findFileApprovalByIdempotency" | "approveFilePreview" | "findTaskById" | "appendAudit" | "appendProvenance" | "claimIntakeFilesForProcessing">;

export class AgenticFileServiceImpl implements AgenticFileService {
  constructor(private readonly repository: FileRepository, private readonly storage: AgenticFileStorage, private readonly scanner: AgenticFileScanner, private readonly parser: AgenticFileParser, private readonly transactions: TransactionRunner, private readonly generateId: () => string, private readonly now: () => string) {}
  async upload(input: AgenticFileUploadRequest, principal: StaffPrincipal): Promise<AgenticFileUploadResult> {
    admin(principal); const format = validateUpload(input); const at = this.now(); const id = this.generateId();
    const file: AgenticIntakeFile = { id, objectKey: `agentic-intake/${id}`, originalFilename: input.originalFilename.trim(), format, mediaType: input.mediaType, byteSize: input.content.byteLength, payloadDigest: sha(input.content), status: "uploaded", createdBy: principal.subject, version: 1, createdAt: at, updatedAt: at };
    const requestDigest = sha(JSON.stringify({ originalFilename: file.originalFilename, mediaType: file.mediaType, byteSize: file.byteSize, payloadDigest: file.payloadDigest }));
    try {
      const reserved = await this.transactions.run(async (s): Promise<AgenticFileUploadResult> => {
        const binding = { kind: "file_upload" as const, actorId: principal.subject, idempotencyKey: input.idempotencyKey, requestDigest, resourceId: file.id, createdAt: at };
        const disposition = await this.repository.bindStaffIntake(s, binding);
        if (disposition !== "created") {
          const existing = await this.repository.findStaffIntakeBinding(s, binding.kind, binding.actorId, binding.idempotencyKey);
          if (existing === undefined || existing.requestDigest !== requestDigest) fail("IDEMPOTENCY_CONFLICT", "Idempotency key is already bound to another upload request");
          const replayed = await this.repository.findIntakeFile(s, existing.resourceId);
          if (replayed === undefined || replayed.createdBy !== principal.subject) fail("IDEMPOTENCY_CONFLICT", "Idempotency binding does not resolve to its original upload");
          return { disposition: "replayed", file: replayed };
        }
        await this.repository.createIntakeFile(s, file);
        await this.audit(s, principal, file.id, "agentic_file.upload", at);
        return { disposition: "created", file };
      });
      if (reserved.disposition === "replayed") return reserved;
      await this.storage.put(file.objectKey, input.content, file.mediaType);
      return reserved;
    } catch (error) {
      await this.storage.delete(file.objectKey).catch(() => undefined);
      if (error instanceof AgenticApplicationError) throw error;
      fail("FILE_UPLOAD_FAILED", "File upload could not be recorded safely");
    }
  }
  async get(fileId: string, principal: StaffPrincipal): Promise<AgenticIntakeFile> {
    admin(principal);
    return this.transactions.runReadOnly(async (session) => {
      const file = await this.file(session, fileId);
      owner(file, principal);
      return file;
    });
  }
  async scanAndPreview(fileId: string, principal: StaffPrincipal): Promise<AgenticFilePreviewDto> {
    admin(principal); const system = principal.subject === "agentic-file-lifecycle"; const file = await this.transactions.runReadOnly(async (s) => { const found = await this.file(s, fileId); if (!system) owner(found, principal); return found; }); if (file.status === "previewed") return this.preview(file.id); if (file.status === "scanning" && system) return this.processScanClaim(file, principal); if (file.status !== "uploaded") fail("FILE_STATE_INVALID", "File cannot be scanned");
    const scanning = transitionAgenticIntakeFile(file, "scanning", this.now()); if (!await this.transactions.run((s) => this.repository.transitionIntakeFile(s, scanning, file.version))) return this.replay(fileId); return this.processScanClaim(scanning, principal);
  }
  async claimPending(limit: number): Promise<readonly string[]> { return this.transactions.run((s) => this.repository.claimIntakeFilesForProcessing(s, this.now(), limit)); }
  async processClaimed(fileId: string): Promise<void> { await this.scanAndPreview(fileId, { subject: "agentic-file-lifecycle", displayName: "Agentic file lifecycle", roles: ["agentic_governance_admin"] }); }
  async claimExpired(_limit: number): Promise<readonly string[]> { return []; }
  async deleteClaimed(_fileId: string): Promise<void> { /* retention is delegated by composition to its storage-safe application service */ }
  private async processScanClaim(scanning: AgenticIntakeFile, principal: StaffPrincipal): Promise<AgenticFilePreviewDto> {
    let current = scanning;
    try {
      if ((await this.scanner.scan(await this.storage.open(scanning.objectKey))).status !== "clean") return this.rejectClaim(scanning, principal);
      const clean = transitionAgenticIntakeFile(scanning, "clean", this.now()); if (!await this.transactions.run((s) => this.repository.transitionIntakeFile(s, clean, scanning.version))) return this.replay(scanning.id); current = clean;
      const parsed = this.parser.parse(clean.format, await bytes(await this.storage.open(scanning.objectKey))); const preview = createAgenticFilePreview(clean, parsed, this.generateId(), this.now()); const previewed = transitionAgenticIntakeFile(clean, "previewed", this.now());
      const settled = await this.transactions.run(async (s) => { await this.repository.appendFilePreview(s, preview); return this.repository.transitionIntakeFile(s, previewed, clean.version); }); if (!settled) return this.replay(scanning.id); return mapPreview(preview, clean.format, previewed.version);
    } catch (error) {
      if (error instanceof FileRejectedError) throw error;
      try { await this.rejectClaim(current, principal); }
      catch (rejection) { if (!(rejection instanceof FileRejectedError)) throw rejection; }
      if (error instanceof AgenticApplicationError) throw error;
      fail("FILE_CONTENT_INVALID", "File content is not safe for intake");
    }
  }
  async reject(id: string, version: number, principal: StaffPrincipal): Promise<AgenticIntakeFile> { return this.terminal(id, version, "rejected", principal); }
  async delete(id: string, version: number, principal: StaffPrincipal): Promise<AgenticIntakeFile> { return this.terminal(id, version, "deleted", principal); }
  async approvePreview(input: ApproveAgenticFilePreviewRequest, principal: StaffPrincipal): Promise<AgentTask> {
    admin(principal); return this.transactions.run(async (s) => { const file = await this.file(s, input.fileId); owner(file, principal); if (file.status === "approved") { const replay = await this.repository.findFileApprovalByIdempotency(s, input.idempotencyKey); if (!replay) fail("FILE_STATE_INVALID", "File preview is not approvable"); if (replay.fileId !== input.fileId || replay.previewVersion !== input.previewVersion || replay.previewPayloadDigest !== input.previewPayloadDigest) fail("IDEMPOTENCY_CONFLICT", "Idempotency key is already bound to another approval request"); const task = await this.repository.findTaskById(s, replay.taskId); if (!task) fail("FILE_APPROVAL_CONFLICT", "Approved task was not found"); return task; } if (file.version !== input.expectedFileVersion) fail("STALE_VERSION", "File version is stale"); if (file.status !== "previewed") fail("FILE_STATE_INVALID", "File preview is not approvable"); const preview = await this.repository.findFilePreview(s, file.id, input.previewVersion); if (!preview || preview.payloadDigest !== input.previewPayloadDigest) fail("PREVIEW_DIGEST_MISMATCH", "Preview payload digest has changed");
      const at = this.now(); const task: AgentTask = { id: this.generateId(), state: "draft", createdBy: principal.subject, goal: `Review intake file: ${file.originalFilename}`, instructions: "Review the approved file preview.", version: 1, createdAt: at, updatedAt: at }; const result = await this.repository.approveFilePreview(s, { id: this.generateId(), fileId: file.id, previewVersion: preview.previewVersion, previewDigest: preview.previewDigest, expectedFileVersion: input.expectedFileVersion, previewPayloadDigest: input.previewPayloadDigest, task, idempotencyKey: input.idempotencyKey, approvedBy: principal.subject, approvedAt: at }); const stored = result.status === "created" ? task : await this.repository.findTaskById(s, result.taskId); if (!stored) fail("FILE_APPROVAL_CONFLICT", "Approved task was not found");
      if (result.status === "created") { await this.repository.appendProvenance(s, { id: this.generateId(), taskId: stored.id, sourceType: "agentic_intake_file", sourceId: file.id, sourceDigest: file.payloadDigest, sourceVersion: file.version, classification: "internal", recordedBy: principal.subject, recordedAt: at }); await this.repository.appendProvenance(s, { id: this.generateId(), taskId: stored.id, sourceType: "agentic_file_preview", sourceId: preview.id, sourceDigest: preview.previewDigest, sourceVersion: preview.previewVersion, classification: "internal", recordedBy: principal.subject, recordedAt: at }); await this.audit(s, principal, file.id, "agentic_file.approve", at); } return stored;
    });
  }
  private async replay(id: string): Promise<AgenticFilePreviewDto> { const file = await this.transactions.runReadOnly((s) => this.file(s, id)); if (file.status !== "previewed") fail("FILE_PROCESSING", "File processing is in progress"); return this.preview(id); }
  private async preview(id: string): Promise<AgenticFilePreviewDto> { return this.transactions.runReadOnly(async (s) => { const [file, preview] = await Promise.all([this.file(s, id), this.repository.findFilePreview(s, id, 1)]); if (!preview) fail("FILE_PREVIEW_NOT_FOUND", "File preview was not found"); return mapPreview(preview, file.format, file.version); }); }
  private async rejectClaim(file: AgenticIntakeFile, principal: StaffPrincipal): Promise<never> { const rejected = transitionAgenticIntakeFile(file, "rejected", this.now()); await this.transactions.run(async (s) => { if (!await this.repository.transitionIntakeFile(s, rejected, file.version)) fail("STALE_VERSION", "File version is stale"); await this.audit(s, principal, file.id, "agentic_file.reject", rejected.updatedAt); }); throw new FileRejectedError(); }
  private async terminal(id: string, expected: number, target: "rejected" | "deleted", principal: StaffPrincipal): Promise<AgenticIntakeFile> { admin(principal); const file = await this.transactions.runReadOnly(async (s) => { const found = await this.file(s, id); owner(found, principal); return found; }); if (file.version !== expected) fail("STALE_VERSION", "File version is stale"); const next = transitionAgenticIntakeFile(file, target, this.now()); await this.transactions.run(async (s) => { if (!await this.repository.transitionIntakeFile(s, next, file.version)) fail("STALE_VERSION", "File version is stale"); await this.audit(s, principal, file.id, `agentic_file.${target === "deleted" ? "delete" : "reject"}`, next.updatedAt); }); return next; }
  private async file(s: DatabaseSession, id: string): Promise<AgenticIntakeFile> { const file = await this.repository.findIntakeFile(s, id); if (!file) fail("FILE_NOT_FOUND", "File was not found"); return file; }
  private async audit(s: DatabaseSession, p: StaffPrincipal, id: string, action: string, at: string): Promise<void> { await this.repository.appendAudit(s, { id: this.generateId(), actorId: p.subject, actorType: "staff", action, resourceType: "agentic_intake_file", resourceId: id, outcome: "allowed", correlationId: id, occurredAt: at }); }
}
function validateUpload(input: AgenticFileUploadRequest): "csv" | "txt" {
  const filename = input.originalFilename.trim();
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1) : "";
  const hasNulByte = input.content.includes(0);
  let text = "";
  let hasValidUtf8 = false;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(input.content); hasValidUtf8 = true; } catch { /* domain validator rejects invalid UTF-8 */ }
  const rows = text.split(/\r?\n/).filter((line) => line.length > 0);
  const fields = rows.flatMap((line) => line.split(","));
  return validateAgenticFileUpload({
    extension,
    mediaType: input.mediaType,
    signature: hasValidUtf8 && !hasNulByte ? "text" : "binary",
    byteSize: input.content.byteLength,
    rowCount: rows.length,
    columnCount: Math.max(1, ...rows.map((line) => line.split(",").length)),
    largestFieldBytes: Math.max(0, ...fields.map((field) => Buffer.byteLength(field, "utf8"))),
    hasValidUtf8,
    hasNulByte,
  }).format;
}
export function createAgenticFilePreview(file: Pick<AgenticIntakeFile, "id" | "payloadDigest">, parsed: { readonly rowCount: number; readonly columnCount: number; readonly samples: readonly string[] }, id: string, at: string): AgenticFilePreview { const samples: string[] = []; const limit = AGENTIC_FILE_LIMITS.maxPreviewBytes - 8 * 1024; for (const sample of parsed.samples) { const candidate = [...samples, sample]; const summary = previewSummary(file.id, parsed.rowCount, parsed.columnCount, candidate); if (Buffer.byteLength(JSON.stringify(summary), "utf8") > limit) break; samples.push(sample); } const summary = previewSummary(file.id, parsed.rowCount, parsed.columnCount, samples); return { id, fileId: file.id, previewVersion: 1, parserVersion: "bounded-csv-txt-v1", payloadDigest: file.payloadDigest, previewDigest: sha(JSON.stringify(summary)), summary, createdAt: at }; }
function previewSummary(fileId: string, rowCount: number, columnCount: number, samples: readonly string[]): Readonly<Record<string, unknown>> { return { rowCount, columnCount, samples: [...samples], sourceReferences: samples.map((_, i) => ({ fileId, line: i + 1 })) }; }
function mapPreview(preview: AgenticFilePreview, format: "csv" | "txt", fileVersion: number): AgenticFilePreviewDto { const s = preview.summary as { rowCount: number; columnCount: number; samples: readonly string[]; sourceReferences: readonly { fileId: string; line: number; column?: number }[] }; return { fileId: preview.fileId, fileVersion, previewVersion: preview.previewVersion, parserVersion: preview.parserVersion, payloadDigest: preview.payloadDigest, previewDigest: preview.previewDigest, format, rowCount: s.rowCount, columnCount: s.columnCount, invalidRows: 0, samples: [...s.samples], sourceReferences: s.sourceReferences.map((r) => ({ ...r })) }; }
async function bytes(stream: NodeJS.ReadableStream): Promise<Buffer> { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }
function sha(input: string | Uint8Array): string { return createHash("sha256").update(input).digest("hex"); }
function admin(p: StaffPrincipal): void { if (!p.roles.includes("agentic_governance_admin") && !p.roles.includes("administrator")) fail("FORBIDDEN", "Governance administrator role is required"); }
function owner(file: AgenticIntakeFile, principal: StaffPrincipal): void { if (file.createdBy !== principal.subject) fail("FORBIDDEN", "Agentic file access is limited to its governance owner"); }
function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
class FileRejectedError extends AgenticApplicationError { constructor() { super("FILE_CONTENT_INVALID", "File content is not safe for intake"); } }
