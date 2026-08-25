// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { NormalizedPaymentNotification } from "../../providers/payment-gateway";

export type PaidTransitionResult =
  | { readonly result: "applied" | "already_processed" }
  | { readonly result: "review_required"; readonly reason: string };

export interface PaymentPaidTransitionPort {
  applyTrustedInSession(
    session: DatabaseSession,
    notification: NormalizedPaymentNotification,
    correlationId: string,
  ): Promise<PaidTransitionResult>;
}
