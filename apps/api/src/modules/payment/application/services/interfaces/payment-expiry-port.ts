// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export type PaymentExpiryResult = "expired" | "paid" | "already_terminal";
export type PaymentCancellationResult = "canceled" | "already_canceled" | "paid" | "already_terminal";

export interface PaymentExpiryPort {
  expireByOrderInSession(
    session: DatabaseSession,
    orderId: string,
    correlationId: string,
    now: string,
  ): Promise<PaymentExpiryResult>;
  cancelByOrderInSession(
    session: DatabaseSession,
    orderId: string,
    actorId: string,
    correlationId: string,
    now: string,
  ): Promise<PaymentCancellationResult>;
}
