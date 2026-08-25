// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface CancelPendingOrderRequest {
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly now: string;
}

export interface PendingOrderCancellationPort {
  cancelInSession(
    session: DatabaseSession,
    request: CancelPendingOrderRequest,
  ): Promise<"canceled" | "already_paid" | "not_cancelable">;
}
