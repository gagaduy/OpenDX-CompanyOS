// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import { AgenticFileLifecycleWorker } from "./agentic-file-lifecycle.worker";

describe("AgenticFileLifecycleWorker", () => {
  it("restarts safely and processes each bounded claimed file once", async () => {
    const files = { claimPending: vi.fn(async () => ["file-1", "file-2"]), processClaimed: vi.fn(async () => undefined), claimExpired: vi.fn(async () => []), deleteClaimed: vi.fn(async () => undefined) };
    const worker = new AgenticFileLifecycleWorker(files, 1_000, 2);

    await worker.tick();
    await worker.tick();

    expect(files.claimPending).toHaveBeenCalledTimes(2);
    expect(files.processClaimed).toHaveBeenCalledWith("file-1");
    expect(files.processClaimed).toHaveBeenCalledWith("file-2");
  });

  it("deletes only storage objects explicitly claimed after rejected seven-day and terminal thirty-day retention", async () => {
    const files = { claimPending: vi.fn(async () => []), processClaimed: vi.fn(), claimExpired: vi.fn(async () => ["rejected-7d", "approved-30d"]), deleteClaimed: vi.fn(async () => undefined) };
    const worker = new AgenticFileLifecycleWorker(files, 1_000, 20);

    await worker.tick();

    expect(files.deleteClaimed).toHaveBeenCalledWith("rejected-7d");
    expect(files.deleteClaimed).toHaveBeenCalledWith("approved-30d");
  });

  it("contains a terminal hostile-file rejection and continues the bounded batch", async () => {
    const files = {
      claimPending: vi.fn(async () => ["infected-file", "clean-file"]),
      processClaimed: vi.fn()
        .mockRejectedValueOnce(new AgenticApplicationError("FILE_CONTENT_INVALID", "File content is not safe for intake"))
        .mockResolvedValueOnce(undefined),
      claimExpired: vi.fn(async () => []),
      deleteClaimed: vi.fn(async () => undefined),
    };
    const worker = new AgenticFileLifecycleWorker(files, 1_000, 2);

    await expect(worker.tick()).resolves.toBeUndefined();

    expect(files.processClaimed).toHaveBeenNthCalledWith(1, "infected-file");
    expect(files.processClaimed).toHaveBeenNthCalledWith(2, "clean-file");
  });

  it("preserves scanner outages for worker visibility", async () => {
    const scannerUnavailable = new AgenticApplicationError("FILE_SCAN_FAILED", "File scan failed");
    const files = {
      claimPending: vi.fn(async () => ["unscanned-file"]),
      processClaimed: vi.fn(async () => { throw scannerUnavailable; }),
      claimExpired: vi.fn(async () => []),
      deleteClaimed: vi.fn(async () => undefined),
    };
    const worker = new AgenticFileLifecycleWorker(files, 1_000, 1);

    await expect(worker.tick()).rejects.toBe(scannerUnavailable);

    expect(files.deleteClaimed).not.toHaveBeenCalled();
  });
});
