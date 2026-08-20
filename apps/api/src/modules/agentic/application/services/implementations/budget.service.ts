// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { AgenticApplicationError } from "../agentic-application.error";
import type {
  BudgetReservationCommand,
  BudgetService,
  BudgetSettlementCommand,
} from "../interfaces/budget.service";

type BudgetRepository = Pick<AgenticRepository, "reserveBudget" | "settleBudget" | "appendAudit">;

export class PostgresqlBudgetService implements BudgetService {
  constructor(
    private readonly repository: BudgetRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async reserve(input: BudgetReservationCommand): Promise<"reserved" | "duplicate" | "conflict" | "exceeded"> {
    assertCost(input.costMicros);
    return this.transactions.run(async (session) => {
      const occurredAt = this.now();
      const result = await this.repository.reserveBudget(session, {
        id: this.generateId(), revisionId: input.revisionId, agentKind: input.agentKind,
        taskId: input.taskId, idempotencyKey: input.idempotencyKey,
        costMicros: input.costMicros, occurredAt,
      });
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: `agent-${input.agentKind}`, actorType: "agent",
        taskId: input.taskId, action: "budget.reserve", resourceType: "agentic_task",
        resourceId: input.taskId,
        outcome: result === "exceeded" || result === "conflict" ? "denied" : "allowed",
        correlationId: input.correlationId, occurredAt,
      });
      return result;
    });
  }

  async settle(input: BudgetSettlementCommand): Promise<"settled" | "duplicate" | "conflict" | "stale"> {
    assertCost(input.actualCostMicros);
    return this.transactions.run(async (session) => {
      const occurredAt = this.now();
      const result = await this.repository.settleBudget(session, {
        id: this.generateId(), reservationId: input.reservationId,
        idempotencyKey: input.idempotencyKey, actualCostMicros: input.actualCostMicros,
        occurredAt,
      });
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: "agentic-budget", actorType: "system",
        action: "budget.settle", resourceType: "budget_reservation",
        resourceId: input.reservationId,
        outcome: result === "stale" || result === "conflict" ? "failed" : "allowed",
        correlationId: input.correlationId, occurredAt,
      });
      return result;
    });
  }
}

function assertCost(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AgenticApplicationError("BUDGET_INVALID", "Budget cost must be a positive safe integer");
  }
}
