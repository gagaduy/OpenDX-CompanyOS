// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SupportAttachmentRetentionWorker } from "./support-attachment-retention.worker";

describe("SupportAttachmentRetentionWorker", () => {
  it("deletes due retained objects outside the claim transaction and tombstones them idempotently", async () => {
    const events: string[] = [];
    const repository = {
      claimAttachmentsForRetention: vi.fn(async () => [{ id: "attachment-1", objectKey: "object-1", version: 2 }]),
      markAttachmentDeleted: vi.fn(async () => { events.push("mark-deleted"); return true; }),
      appendAudit: vi.fn(async () => undefined),
    };
    const storage = { delete: vi.fn(async () => { events.push("delete"); }) };
    const worker = new SupportAttachmentRetentionWorker(tx(events), repository as never, storage as never, () => "id", () => "2027-08-10T00:00:00.000Z");

    await expect(worker.tick()).resolves.toBe(1);

    expect(repository.claimAttachmentsForRetention).toHaveBeenCalledWith(expect.anything(), "2027-08-10T00:00:00.000Z", 20);
    expect(storage.delete).toHaveBeenCalledWith("object-1");
    expect(events).toEqual(["tx-start", "tx-end", "delete", "tx-start", "mark-deleted", "tx-end"]);
  });
});

function tx(events: string[]) {
  return {
    run: async <T>(work: (session: never) => Promise<T>) => { events.push("tx-start"); const result = await work({} as never); events.push("tx-end"); return result; },
    runReadOnly: vi.fn(),
  };
}
