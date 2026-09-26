// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { VerifiedDecisionHistoryReader } from "../../../../../shared/verified-decision-evidence";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { CommandActivityEvent, CommandActivityFeedEvent, CreateCommandActivityInput } from "../../../domain/entities/command-activity-event";
import { AgenticApplicationError } from "../agentic-application.error";
import type { CommandActivityService } from "../interfaces/command-activity.service";

export class CommandActivityServiceImpl implements CommandActivityService {
  constructor(
    private readonly repository: AgenticRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly decisionReaders: readonly VerifiedDecisionHistoryReader[] = [],
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

  listRecent(limit: number): Promise<readonly CommandActivityFeedEvent[]> {
    return this.transactions.runReadOnly(async (session) => {
      const explicit = await this.repository.listCommandActivity(session, limit);
      const history = [];
      for (const reader of this.decisionReaders) history.push(await reader.listRecent(session, limit));
      const byDecision = new Map<string, CommandActivityFeedEvent>();
      const key = (event: Pick<CommandActivityFeedEvent, "department" | "resourceType" | "resourceId" | "decision">) =>
        `${event.department}:${event.resourceType}:${event.resourceId}:${event.decision}`;
      for (const event of history.flat().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))) {
        if (!byDecision.has(key(event))) byDecision.set(key(event), { ...event, source: "business_history" });
      }
      const explicitDecisions = new Set<string>();
      for (const event of explicit) {
        if (explicitDecisions.has(key(event))) continue;
        explicitDecisions.add(key(event));
        byDecision.set(key(event), { ...event, source: "command_activity" });
      }
      const perDepartment = new Map<CommandActivityFeedEvent["department"], number>();
      return [...byDecision.values()]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
        .filter((event) => {
          const count = perDepartment.get(event.department) ?? 0;
          if (count >= limit) return false;
          perDepartment.set(event.department, count + 1);
          return true;
        });
    });
  }
}
