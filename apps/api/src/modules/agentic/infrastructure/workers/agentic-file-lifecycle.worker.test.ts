// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
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
});
