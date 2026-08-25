// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { AgenticFileStorage } from "../../storage/agentic-file-storage";

type RetentionRepository = Pick<AgenticRepository, "claimExpiredIntakeFiles" | "markIntakeObjectDeleted" | "appendAudit">;

/** Deletes only explicitly eligible private objects; metadata remains append-only. */
export class AgenticFileRetentionService {
  constructor(private readonly repository: RetentionRepository, private readonly storage: AgenticFileStorage, private readonly transactions: TransactionRunner, private readonly generateId: () => string, private readonly now: () => string) {}
  async deleteExpired(limit: number): Promise<void> {
    const at = this.now();
    const files = await this.transactions.run((session) => this.repository.claimExpiredIntakeFiles(session, at, limit));
    for (const file of files) {
      try { await this.storage.delete(file.objectKey); }
      catch { continue; }
      await this.transactions.run(async (session) => {
        if (await this.repository.markIntakeObjectDeleted(session, file.id, file.version, at)) await this.repository.appendAudit(session, { id: this.generateId(), actorId: "agentic-file-retention", actorType: "system", action: "agentic_file.object_deleted", resourceType: "agentic_intake_file", resourceId: file.id, outcome: "allowed", correlationId: file.id, occurredAt: at });
      });
    }
  }
}
