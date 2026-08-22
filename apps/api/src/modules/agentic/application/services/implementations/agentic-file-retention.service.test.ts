// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { AgenticFileRetentionService } from "./agentic-file-retention.service";

describe("AgenticFileRetentionService", () => {
  it("tombstones a claimed rejected object only after private storage deletes it", async () => {
    const repository = { claimExpiredIntakeFiles: vi.fn(async () => [{ id: "f", objectKey: "agentic-intake/f", version: 2 }]), markIntakeObjectDeleted: vi.fn(async () => true), appendAudit: vi.fn(async () => undefined) };
    const storage = { delete: vi.fn(async () => undefined) };
    const service = new AgenticFileRetentionService(repository as never, storage as never, { run: async <T>(fn: (s: never) => Promise<T>) => fn(undefined as never) } as never, () => "audit", () => "2026-08-29T00:00:00.000Z");
    await service.deleteExpired(20);
    expect(storage.delete).toHaveBeenCalledWith("agentic-intake/f");
    expect(repository.markIntakeObjectDeleted).toHaveBeenCalled();
  });
  it("leaves the durable tombstone claim untouched when private storage deletion fails", async () => {
    const repository = { claimExpiredIntakeFiles: vi.fn(async () => [{ id: "f", objectKey: "agentic-intake/f", version: 2 }]), markIntakeObjectDeleted: vi.fn(), appendAudit: vi.fn() };
    const storage = { delete: vi.fn(async () => { throw new Error("MinIO unavailable"); }) };
    const service = new AgenticFileRetentionService(repository as never, storage as never, { run: async <T>(fn: (s: never) => Promise<T>) => fn(undefined as never) } as never, () => "audit", () => "2026-08-29T00:00:00.000Z");
    await service.deleteExpired(20);
    expect(repository.markIntakeObjectDeleted).not.toHaveBeenCalled();
  });
});
