// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PaymentStatus } from "./payment";
export interface PaymentReconciliation {
  readonly id: string;
  readonly paymentId: string;
  readonly attemptId: string;
  readonly triggerActorType: "staff" | "system";
  readonly triggerActorId: string;
  readonly providerOrderId?: string;
  readonly internalStatus: PaymentStatus;
  readonly providerStatus?: string;
  readonly internalAmountVnd: number;
  readonly providerAmountVnd?: number;
  readonly comparisonResult: "matched_paid" | "still_pending" | "mismatch" | "unsupported" | "provider_error";
  readonly redactedResponse?: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly createdAt: string;
}
