// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { AgenticFileScanner, AgenticFileScanResult } from "../../security/agentic-file-scanner";
import type { AgenticFileStorage } from "../../storage/agentic-file-storage";
import type { AgenticFileParser } from "../../parsing/agentic-file-parser";
import { AGENTIC_FILE_LIMITS } from "../../../domain/services/agentic-file-rules";
import { AgenticFileServiceImpl, createAgenticFilePreview } from "./agentic-file.service";

const session = {} as DatabaseSession;
const tx: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const admin: StaffPrincipal = { subject: "governance-admin", displayName: "Governance Admin", roles: ["agentic_governance_admin"] };
const content = Buffer.from("sku,quantity\nSKU-1,4\n", "utf8");

describe("AgenticFileServiceImpl", () => {
  it("compensates an orphaned private object when metadata reservation fails", async () => {
    const { service, storage } = harness({ createFails: true });
    await expect(service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content }, admin))
      .rejects.toMatchObject({ code: "FILE_UPLOAD_FAILED" });
    expect(storage.delete).toHaveBeenCalledWith(expect.stringMatching(/^agentic-intake\//));
  });

  it("does not scan when another worker has already claimed the uploaded file", async () => {
    const { service, scanner } = harness({ transitionResults: [false] });
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content }, admin);
    await expect(service.scanAndPreview(uploaded.file.id, admin)).rejects.toMatchObject({ code: "FILE_PROCESSING" });
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it.each([
    ["infected", { status: "infected", signature: "Eicar-Test-Signature" }],
    ["malformed", { status: "clean" }],
  ] as const)("rejects and removes %s content without producing a preview", async (kind, result) => {
    const { service, storage, repository } = harness({ scanResult: result, content: kind === "malformed" ? Buffer.from('"unterminated') : content });
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content: kind === "malformed" ? Buffer.from('"unterminated') : content }, admin);
    await expect(service.scanAndPreview(uploaded.file.id, admin)).rejects.toMatchObject({ code: "FILE_CONTENT_INVALID" });
    expect(storage.delete).toHaveBeenCalledWith(uploaded.file.objectKey);
    expect(repository.appendFilePreview).not.toHaveBeenCalled();
  });

  it("rejects a malformed file after clean transition using the clean record version", async () => {
    const { service, storage, repository } = harness({ content: Buffer.from('"unterminated'), enforceExpectedVersion: true });
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content: Buffer.from('"unterminated') }, admin);
    await expect(service.scanAndPreview(uploaded.file.id, admin)).rejects.toMatchObject({ code: "FILE_CONTENT_INVALID" });
    expect(await repository.findIntakeFile(session, uploaded.file.id)).toMatchObject({ status: "rejected", version: 4 });
    expect(storage.delete).toHaveBeenCalledWith(uploaded.file.objectKey);
  });

  it("returns a stable digest over an aggregate-only bounded preview", async () => {
    const { service } = harness();
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content }, admin);
    const preview = await service.scanAndPreview(uploaded.file.id, admin);
    expect(preview).toMatchObject({ payloadDigest: uploaded.file.payloadDigest, rowCount: 2, columnCount: 2 });
    expect(preview.sourceReferences[0]).toEqual({ fileId: uploaded.file.id, line: 1 });
    expect(preview.previewDigest).toMatch(/^[a-f0-9]{64}$/);
    expect("content" in preview).toBe(false);
  });

  it("uses an injected application parser rather than infrastructure parsing", async () => {
    const { service, parser } = harness();
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content }, admin);
    await service.scanAndPreview(uploaded.file.id, admin);
    expect(parser.parse).toHaveBeenCalledWith("csv", expect.any(Buffer));
  });

  it("caps retained aggregate preview content at 256 KiB", async () => {
    const longRows = Buffer.from(Array.from({ length: 50 }, (_, index) => `${index},${"x".repeat(6_000)}`).join("\n"));
    const { service } = harness({ content: longRows });
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content: longRows }, admin);
    const preview = await service.scanAndPreview(uploaded.file.id, admin);
    expect(Buffer.byteLength(JSON.stringify(preview), "utf8")).toBeLessThanOrEqual(AGENTIC_FILE_LIMITS.maxPreviewBytes);
  });

  it("produces the same preview digest for equivalent parsed content", () => {
    const file = { id: "file-1", payloadDigest: "a".repeat(64) };
    const parsed = { rowCount: 2, columnCount: 2, samples: ["sku,quantity", "SKU-1,4"] };
    expect(createAgenticFilePreview(file, parsed, "preview-1", "2026-08-22T00:00:00.000Z").previewDigest)
      .toBe(createAgenticFilePreview(file, { ...parsed, samples: [...parsed.samples] }, "preview-2", "2026-08-22T00:01:00.000Z").previewDigest);
  });

  it("replays an approval with the same task and creates neither subtasks nor runtime work", async () => {
    const { service, repository } = harness();
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content }, admin);
    const preview = await service.scanAndPreview(uploaded.file.id, admin);
    const input = { fileId: uploaded.file.id, expectedFileVersion: 4, previewVersion: 1, previewPayloadDigest: preview.payloadDigest, idempotencyKey: "approval-1" };
    const first = await service.approvePreview(input, admin);
    const replay = await service.approvePreview(input, admin);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ state: "draft" });
    expect("configurationRevisionId" in first).toBe(false);
    expect(repository.approveFilePreview).toHaveBeenCalledOnce();
    expect(repository.appendProvenance).toHaveBeenCalledTimes(2);
  });

  it("returns one task when concurrent approvals race", async () => {
    const { service } = harness();
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content }, admin);
    const preview = await service.scanAndPreview(uploaded.file.id, admin);
    const input = { fileId: uploaded.file.id, expectedFileVersion: 4, previewVersion: 1, previewPayloadDigest: preview.payloadDigest, idempotencyKey: "approval-race" };
    const tasks = await Promise.all([service.approvePreview(input, admin), service.approvePreview(input, admin)]);
    expect(tasks[0]!.id).toBe(tasks[1]!.id);
  });

  it("rejects stale file versions and changed preview digests before approval", async () => {
    const { service } = harness();
    const uploaded = await service.upload({ originalFilename: "stock.csv", mediaType: "text/csv", content }, admin);
    const preview = await service.scanAndPreview(uploaded.file.id, admin);
    await expect(service.approvePreview({ fileId: uploaded.file.id, expectedFileVersion: 3, previewVersion: 1, previewPayloadDigest: preview.payloadDigest, idempotencyKey: "stale" }, admin)).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(service.approvePreview({ fileId: uploaded.file.id, expectedFileVersion: 4, previewVersion: 1, previewPayloadDigest: "b".repeat(64), idempotencyKey: "changed" }, admin)).rejects.toMatchObject({ code: "PREVIEW_DIGEST_MISMATCH" });
  });
});

function harness(options: { readonly createFails?: boolean; readonly transitionResults?: readonly boolean[]; readonly enforceExpectedVersion?: boolean; readonly scanResult?: { readonly status: "clean" } | { readonly status: "infected"; readonly signature: string }; readonly content?: Buffer; readonly approvalResults?: readonly { readonly status: "created" | "duplicate"; readonly taskId: string }[] } = {}) {
  const files = new Map<string, any>(); const previews = new Map<string, any>();
  const storage: AgenticFileStorage = { put: vi.fn(async () => undefined), open: vi.fn(async () => Readable.from([options.content ?? content])), delete: vi.fn(async () => undefined) };
  const clean: AgenticFileScanResult = { status: "clean" };
  const scanner: AgenticFileScanner = { scan: vi.fn(async () => options.scanResult ?? clean) };
  const parser: AgenticFileParser = { parse: vi.fn((_format, bytes) => { const text = Buffer.from(bytes).toString("utf8"); if (text === '"unterminated') throw new Error("invalid csv"); const samples = text.split("\n").filter((line) => line.length > 0); return { rowCount: samples.length, columnCount: samples[0]?.split(",").length ?? 1, samples }; }) };
  const transitions = [...(options.transitionResults ?? [])]; const approvals = [...(options.approvalResults ?? [])]; const approved = new Map<string, string>(); const approvedTasks = new Map<string, any>();
  const repository = {
    createIntakeFile: vi.fn(async (_: DatabaseSession, file: any) => { if (options.createFails) throw new Error("db unavailable"); files.set(file.id, file); }),
    findIntakeFile: vi.fn(async (_: DatabaseSession, id: string) => files.get(id)),
    transitionIntakeFile: vi.fn(async (_: DatabaseSession, file: any, expectedVersion: number) => { const result = transitions.shift() ?? true; if (result && (!options.enforceExpectedVersion || files.get(file.id)?.version === expectedVersion)) { files.set(file.id, file); return true; } return false; }),
    appendFilePreview: vi.fn(async (_: DatabaseSession, preview: any) => { previews.set(`${preview.fileId}:${preview.previewVersion}`, preview); }),
    findFilePreview: vi.fn(async (_: DatabaseSession, fileId: string, version: number) => previews.get(`${fileId}:${version}`)),
    findFileApprovalByIdempotency: vi.fn(async (_: DatabaseSession, key: string) => { const taskId = approved.get(key); return taskId === undefined ? undefined : { status: "duplicate" as const, taskId }; }),
    approveFilePreview: vi.fn(async (_: DatabaseSession, input: any) => {
      const existing = approved.get(input.idempotencyKey);
      if (existing !== undefined) return { status: "duplicate" as const, taskId: existing };
      const result = approvals.shift() ?? { status: "created" as const, taskId: input.task.id };
      approved.set(input.idempotencyKey, result.status === "created" ? input.task.id : result.taskId);
      approvedTasks.set(input.task.id, input.task);
      const file = files.get(input.fileId); if (file && result.status === "created") files.set(input.fileId, { ...file, status: "approved", version: file.version + 1 });
      return result.status === "created" ? { status: "created" as const, taskId: input.task.id } : result;
    }),
    findTaskById: vi.fn(async (_: DatabaseSession, id: string) => approvedTasks.get(id) ?? ({ id, state: "draft", createdBy: "governance-admin", goal: "Review intake file", instructions: "Review the approved file preview.", version: 1, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" })),
    appendAudit: vi.fn(async () => undefined), appendProvenance: vi.fn(async () => undefined),
  };
  let id = 0;
  return { service: new AgenticFileServiceImpl(repository as unknown as AgenticRepository, storage, scanner, parser, tx, () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, () => "2026-08-22T00:00:00.000Z"), storage, scanner, parser, repository };
}
