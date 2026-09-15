// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { CommandActivityEvent, CreateCommandActivityInput } from "../../../domain/entities/command-activity-event";
import { AgenticApplicationError } from "../agentic-application.error";
import type { CommandActivityService } from "../interfaces/command-activity.service";

export class CommandActivityServiceImpl implements CommandActivityService {
  constructor(
    private readonly repository: AgenticRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async record(input: CreateCommandActivityInput, principal: StaffPrincipal): Promise<CommandActivityEvent> {
    const event: CommandActivityEvent = {
      id: this.generateId(),
      actorId: principal.subject,
      ...input,
      occurredAt: this.now(),
    };
    const persisted = await this.transactions.run((session) =>
      this.repository.appendCommandActivity(session, event),
    );
    if (
      persisted.actorId !== event.actorId ||
      persisted.department !== event.department ||
      persisted.decision !== event.decision ||
      persisted.resourceType !== event.resourceType ||
      persisted.resourceId !== event.resourceId ||
      persisted.summary !== event.summary
    ) {
      throw new AgenticApplicationError("IDEMPOTENCY_CONFLICT", "Activity idempotency key is already bound to different input");
    }
    return persisted;
  }

  listRecent(limit: number): Promise<readonly CommandActivityEvent[]> {
    return this.transactions.runReadOnly((session) => this.repository.listCommandActivity(session, limit));
  }
}
