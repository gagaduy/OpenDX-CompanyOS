// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { SupportAttachmentScanWorker } from "./support-attachment-scan.worker";

describe("SupportAttachmentScanWorker", () => {
  it("claims a batch, scans outside the claim transaction, and publishes clean metadata", async () => {
    const events: string[] = [];
    const repository = {
      claimAttachmentsForScan: vi.fn(async () => [{ id: "attachment-1", objectKey: "object-1", version: 1 }]),
      markAttachmentClean: vi.fn(async () => { events.push("mark-clean"); return true; }),
      markAttachmentRejected: vi.fn(async () => true),
      appendAudit: vi.fn(async () => undefined),
    };
    const worker = new SupportAttachmentScanWorker(tx(events), repository as never, { open: vi.fn(async () => { events.push("open"); return Readable.from(["x"]); }), delete: vi.fn() } as never, { scan: vi.fn(async () => { events.push("scan"); return { status: "clean" as const }; }) }, () => "id", () => "2026-08-10T00:00:00.000Z");

    await expect(worker.tick()).resolves.toBe(1);

    expect(repository.claimAttachmentsForScan).toHaveBeenCalledWith(expect.anything(), "2026-08-10T00:00:00.000Z", 20);
    expect(events).toEqual(["tx-start", "tx-end", "open", "scan", "tx-start", "mark-clean", "tx-end"]);
  });

  it("deletes infected objects and keeps a rejected tombstone", async () => {
    const repository = { claimAttachmentsForScan: vi.fn(async () => [{ id: "attachment-1", objectKey: "object-1", version: 1 }]), markAttachmentClean: vi.fn(), markAttachmentRejected: vi.fn(async () => true), appendAudit: vi.fn(async () => undefined) };
    const storage = { open: vi.fn(async () => Readable.from(["x"])), delete: vi.fn(async () => undefined) };
    const worker = new SupportAttachmentScanWorker(tx([]), repository as never, storage as never, { scan: vi.fn(async () => ({ status: "infected" as const, signature: "Eicar" })) }, () => "id", () => "2026-08-10T00:00:00.000Z");

    await worker.tick();

    expect(storage.delete).toHaveBeenCalledWith("object-1");
    expect(repository.markAttachmentRejected).toHaveBeenCalledWith(expect.anything(), "attachment-1", 1, "2026-08-10T00:00:00.000Z");
  });
});

function tx(events: string[]) {
  return {
    run: async <T>(work: (session: never) => Promise<T>) => { events.push("tx-start"); const result = await work({} as never); events.push("tx-end"); return result; },
    runReadOnly: vi.fn(),
  };
}
