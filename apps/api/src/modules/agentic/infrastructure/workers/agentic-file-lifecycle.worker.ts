// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { AgenticApplicationError } from "../../application/services/agentic-application.error";

export interface AgenticFileLifecyclePort {
  claimPending(limit: number): Promise<readonly string[]>;
  processClaimed(fileId: string): Promise<void>;
  claimExpired(limit: number): Promise<readonly string[]>;
  deleteClaimed(fileId: string): Promise<void>;
  deleteExpired?(limit: number): Promise<void>;
}

/** Bounded, restart-safe driver: claim semantics live in the durable file port. */
export class AgenticFileLifecycleWorker {
  private timer?: NodeJS.Timeout;

  constructor(private readonly files: AgenticFileLifecyclePort, private readonly intervalMs: number, private readonly batchSize: number) {}

  start(): void { if (this.timer === undefined) this.timer = setInterval(() => { void this.tick(); }, this.intervalMs); }
  stop(): void { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; }
  async tick(): Promise<void> {
    for (const fileId of await this.files.claimPending(this.batchSize)) {
      try { await this.files.processClaimed(fileId); }
      catch (error) { if (!isTerminalContentRejection(error)) throw error; }
    }
    if (this.files.deleteExpired !== undefined) await this.files.deleteExpired(this.batchSize);
    else for (const fileId of await this.files.claimExpired(this.batchSize)) await this.files.deleteClaimed(fileId);
  }
}

function isTerminalContentRejection(error: unknown): boolean {
  return error instanceof AgenticApplicationError && error.code === "FILE_CONTENT_INVALID" && !error.retryable;
}
