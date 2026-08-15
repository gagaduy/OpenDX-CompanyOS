// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import { PaymentApplicationError } from "../payment-application.error";
import type {
  PaymentAgeBucket,
  PaymentDiscrepancyComparison,
  PaymentDiscrepancyResult,
  PaymentHealthReader,
  PaymentHealthRepository,
  PaymentHealthWindow,
  PendingPaymentHealth,
  ProviderEvidenceHealth,
  ProviderStatusClass,
} from "../interfaces/payment-health-reader";

const DAY_MS = 86_400_000;
const CURSOR_TTL_MS = 5 * 60_000;
const ageBucketOrder: readonly PaymentAgeBucket[] = [
  "under_15_minutes",
  "15_to_60_minutes",
  "1_to_24_hours",
  "over_24_hours",
];
const normalizedStateOrder = ["paid", "unsupported", "invalid"] as const;

export class PaymentHealthReaderService implements PaymentHealthReader {
  constructor(
    private readonly repository: PaymentHealthRepository,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async pendingPayments(input: PaymentHealthWindow): Promise<PendingPaymentHealth> {
    const bound = validate(input);
    const result = await this.read((session) => this.repository.readPendingPayments(session, {
      ...input,
      asOf: this.now(),
      limit: bound.limit,
    }));
    const mapped = {
      pendingCount: result.pendingCount,
      pendingExpectedAmountVnd: result.pendingExpectedAmountVnd,
      oldestCreatedAt: result.oldestCreatedAt,
      countsByStatus: [...result.countsByStatus].sort((left, right) =>
        left.status.localeCompare(right.status)),
      ageBuckets: [...result.ageBuckets].sort((left, right) =>
        ageBucketOrder.indexOf(left.bucket) - ageBucketOrder.indexOf(right.bucket)),
    };
    assertSafe(mapped);
    return mapped;
  }

  async reconciliationDiscrepancies(
    input: PaymentHealthWindow,
  ): Promise<PaymentDiscrepancyResult> {
    const bound = validate(input);
    const after = decodeCursor(input.cursor, this.now(), "reconciliation");
    const result = await this.read((session) =>
      this.repository.readReconciliationDiscrepancies(session, {
        ...input,
        asOf: this.now(),
        limit: bound.limit + 1,
        ...(after === undefined ? {} : { after }),
      }));
    assertSafe(result.summary);
    const mapped = result.evidence.map((fact) => ({
      reconciliationId: fact.reconciliationId,
      paymentId: fact.paymentId,
      comparisonResult: fact.comparisonResult,
      internalStatus: fact.internalStatus,
      providerStatusClass: providerStatusClass(fact.comparisonResult, fact.providerStatus),
      internalAmountVnd: fact.internalAmountVnd,
      providerAmountVnd: fact.providerAmountVnd,
      differenceVnd: fact.providerAmountVnd === null
        ? 0
        : safeDifference(fact.internalAmountVnd, fact.providerAmountVnd),
      createdAt: fact.createdAt,
    }));
    assertSafe(mapped);
    const hasNext = mapped.length > bound.limit;
    const evidence = hasNext ? mapped.slice(0, bound.limit) : mapped;
    const last = evidence.at(-1);
    return {
      summary: result.summary,
      evidence,
      ...(hasNext && last !== undefined ? {
        nextCursor: encodeCursor(
          [last.createdAt, last.reconciliationId],
          this.now(),
          "reconciliation",
        ),
      } : {}),
    };
  }

  async providerEvidenceStatus(input: PaymentHealthWindow): Promise<ProviderEvidenceHealth> {
    const bound = validate(input);
    const result = await this.read((session) =>
      this.repository.readProviderEvidenceStatus(session, {
        ...input,
        asOf: this.now(),
        limit: bound.limit,
      }));
    assertSafe(result);
    if (result.matchedPayments > result.totalPayments) unsafe();
    return {
      authenticatedEvents: result.authenticatedEvents,
      rejectedEvents: result.rejectedEvents,
      appliedEvents: result.appliedEvents,
      reviewRequiredEvents: result.reviewRequiredEvents,
      unmatchedPayments: result.totalPayments - result.matchedPayments,
      coverageBasisPoints: result.totalPayments === 0
        ? 10_000
        : Math.floor(result.matchedPayments * 10_000 / result.totalPayments),
      countsByNormalizedState: [...result.countsByNormalizedState].sort((left, right) =>
        normalizedStateOrder.indexOf(left.status as typeof normalizedStateOrder[number])
        - normalizedStateOrder.indexOf(right.status as typeof normalizedStateOrder[number])),
    };
  }

  private read<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return this.transactions.runReadOnly(async (session) => {
      await session.query("SET LOCAL statement_timeout = '750ms'");
      await session.query("SET LOCAL lock_timeout = '100ms'");
      return work(session);
    });
  }
}

function validate(input: PaymentHealthWindow) {
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  const limit = input.limit ?? 25;
  if (
    !Number.isFinite(start) || !Number.isFinite(end)
    || end <= start || end - start > 90 * DAY_MS
  ) invalid("Payment health window is invalid");
  if (input.timezone !== "Asia/Ho_Chi_Minh") invalid("Payment health timezone is invalid");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid("Payment evidence limit is invalid");
  return { limit };
}

function providerStatusClass(
  comparison: PaymentDiscrepancyComparison,
  providerStatus: string | null,
): ProviderStatusClass {
  if (comparison === "provider_error") return "provider_error";
  if (comparison === "unsupported") return "unsupported";
  const normalized = providerStatus?.trim().toUpperCase();
  if (["CAPTURED", "PAID", "SUCCESS", "SUCCEEDED"].includes(normalized ?? "")) return "paid";
  if (["CREATED", "PENDING", "AUTHENTICATION_PENDING", "PROCESSING"].includes(normalized ?? "")) return "pending";
  if (["FAILED", "DECLINED", "CANCELED", "CANCELLED", "EXPIRED"].includes(normalized ?? "")) return "failed";
  return "unknown";
}

function safeDifference(left: number, right: number): number {
  const result = Math.abs(left - right);
  if (!Number.isSafeInteger(result)) return unsafe();
  return result;
}

function encodeCursor(key: readonly unknown[], now: string, kind: string): string {
  return Buffer.from(JSON.stringify({ kind, key, expiresAt: Date.parse(now) + CURSOR_TTL_MS }), "utf8")
    .toString("base64url");
}

function decodeCursor(cursor: string | undefined, now: string, kind: string) {
  if (cursor === undefined) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      kind?: unknown; key?: unknown; expiresAt?: unknown;
    };
    if (
      value.kind !== kind || !Array.isArray(value.key)
      || typeof value.expiresAt !== "number" || Date.parse(now) > value.expiresAt
    ) invalid("Payment evidence cursor is invalid or expired");
    return value.key;
  } catch (error) {
    if (error instanceof PaymentApplicationError) throw error;
    return invalid("Payment evidence cursor is invalid or expired");
  }
}

function assertSafe(value: unknown): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) unsafe();
  } else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) assertSafe(child);
  }
}

function invalid(message: string): never {
  throw new PaymentApplicationError("VALIDATION_ERROR", message);
}

function unsafe(): never {
  throw new PaymentApplicationError("UNSAFE_HEALTH_VALUE", "Payment health value is unsafe");
}
