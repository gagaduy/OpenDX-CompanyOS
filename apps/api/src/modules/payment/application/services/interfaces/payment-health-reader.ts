// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface PaymentHealthWindow {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
  readonly limit?: number;
  readonly cursor?: string;
}

export type PaymentAgeBucket =
  | "under_15_minutes"
  | "15_to_60_minutes"
  | "1_to_24_hours"
  | "over_24_hours";

export interface PendingPaymentHealth {
  readonly pendingCount: number;
  readonly pendingExpectedAmountVnd: number;
  readonly oldestCreatedAt: string | null;
  readonly countsByStatus: readonly { readonly status: string; readonly count: number }[];
  readonly ageBuckets: readonly {
    readonly bucket: PaymentAgeBucket;
    readonly count: number;
    readonly amountVnd: number;
  }[];
}

export type ProviderStatusClass =
  | "paid"
  | "pending"
  | "failed"
  | "unsupported"
  | "provider_error"
  | "unknown";

export type PaymentDiscrepancyComparison = "mismatch" | "provider_error" | "unsupported";

export interface PaymentDiscrepancyFact {
  readonly reconciliationId: string;
  readonly paymentId: string;
  readonly comparisonResult: PaymentDiscrepancyComparison;
  readonly internalStatus: string;
  readonly providerStatus: string | null;
  readonly internalAmountVnd: number;
  readonly providerAmountVnd: number | null;
  readonly createdAt: string;
}

export interface PaymentDiscrepancyResult {
  readonly summary: {
    readonly reconciliationCount: number;
    readonly mismatchCount: number;
    readonly providerErrorCount: number;
    readonly unsupportedCount: number;
    readonly amountDifferenceVnd: number;
  };
  readonly evidence: readonly {
    readonly reconciliationId: string;
    readonly paymentId: string;
    readonly comparisonResult: PaymentDiscrepancyComparison;
    readonly internalStatus: string;
    readonly providerStatusClass: ProviderStatusClass;
    readonly internalAmountVnd: number;
    readonly providerAmountVnd: number | null;
    readonly differenceVnd: number;
    readonly createdAt: string;
  }[];
  readonly nextCursor?: string;
}

export interface ProviderEvidenceFacts {
  readonly authenticatedEvents: number;
  readonly rejectedEvents: number;
  readonly appliedEvents: number;
  readonly reviewRequiredEvents: number;
  readonly matchedPayments: number;
  readonly totalPayments: number;
  readonly countsByNormalizedState: readonly { readonly status: string; readonly count: number }[];
}

export interface ProviderEvidenceHealth {
  readonly authenticatedEvents: number;
  readonly rejectedEvents: number;
  readonly appliedEvents: number;
  readonly reviewRequiredEvents: number;
  readonly unmatchedPayments: number;
  readonly coverageBasisPoints: number;
  readonly countsByNormalizedState: readonly { readonly status: string; readonly count: number }[];
}

export interface PaymentHealthReader {
  pendingPayments(input: PaymentHealthWindow): Promise<PendingPaymentHealth>;
  reconciliationDiscrepancies(input: PaymentHealthWindow): Promise<PaymentDiscrepancyResult>;
  providerEvidenceStatus(input: PaymentHealthWindow): Promise<ProviderEvidenceHealth>;
}

export interface PaymentHealthQuery extends PaymentHealthWindow {
  readonly asOf: string;
  readonly limit: number;
  readonly after?: readonly unknown[];
}

export interface PaymentHealthRepository {
  readPendingPayments(
    session: DatabaseSession,
    query: PaymentHealthQuery,
  ): Promise<PendingPaymentHealth>;
  readReconciliationDiscrepancies(
    session: DatabaseSession,
    query: PaymentHealthQuery,
  ): Promise<Omit<PaymentDiscrepancyResult, "evidence" | "nextCursor"> & {
    readonly evidence: readonly PaymentDiscrepancyFact[];
  }>;
  readProviderEvidenceStatus(
    session: DatabaseSession,
    query: PaymentHealthQuery,
  ): Promise<ProviderEvidenceFacts>;
}
