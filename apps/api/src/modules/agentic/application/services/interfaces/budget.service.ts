// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentKind } from "../../../domain/entities/agent-profile";

export interface BudgetReservationCommand {
  readonly revisionId: string;
  readonly agentKind: AgentKind;
  readonly taskId: string;
  readonly idempotencyKey: string;
  readonly costMicros: number;
  readonly correlationId: string;
}

export interface BudgetSettlementCommand {
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly actualCostMicros: number;
  readonly correlationId: string;
}

export interface BudgetService {
  reserve(input: BudgetReservationCommand): Promise<"reserved" | "duplicate" | "conflict" | "exceeded">;
  settle(input: BudgetSettlementCommand): Promise<"settled" | "duplicate" | "conflict" | "stale">;
}
