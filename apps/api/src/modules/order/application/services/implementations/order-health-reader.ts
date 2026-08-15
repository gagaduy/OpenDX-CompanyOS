// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { OrderStatus } from "../../../domain/entities/order";
import { OrderApplicationError } from "../order-application.error";
import type {
  OrderExpiryRiskInput,
  OrderExpiryRiskResult,
  OrderHealthReader,
  OrderHealthRepository,
  OrderHealthWindow,
  OrderInvalidReason,
  OrderInvalidStateResult,
  OrderStalledInput,
  OrderStalledReason,
  OrderStalledResult,
  SupportOrderContext,
  SupportOrderContextReader,
} from "../interfaces/order-health-reader";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CURSOR_TTL_MS = 5 * MINUTE_MS;
const invalidReasonOrder: readonly OrderInvalidReason[] = [
  "PAID_TIMESTAMP_MISSING",
  "COMPLETED_TIMESTAMP_MISSING",
  "TERMINAL_TIMESTAMP_CONFLICT",
  "ILLEGAL_STATUS_TRANSITION",
];

export class OrderHealthReaderService
implements OrderHealthReader, SupportOrderContextReader {
  constructor(
    private readonly repository: OrderHealthRepository,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async stalledSummary(input: OrderStalledInput): Promise<OrderStalledResult> {
    const bound = validateWindow(input);
    const minimumAgeMinutes = input.minimumAgeMinutes ?? 120;
    if (
      !Number.isInteger(minimumAgeMinutes)
      || minimumAgeMinutes < 15 || minimumAgeMinutes > 10_080
    ) invalid("Order stalled age is invalid");
    const after = decodeAfter(input.cursor, this.now(), "stalled");
    const result = await this.read((session) => this.repository.readStalledOrders(session, {
      ...input,
      asOf: this.now(),
      limit: bound.limit + 1,
      minimumAgeMinutes,
      ...(after === undefined ? {} : { after }),
    }));
    assertSafe(result.summary);
    const mapped = result.evidence.map((fact) => ({
      orderId: fact.orderId,
      status: fact.status,
      createdAt: fact.createdAt,
      updatedAt: fact.updatedAt,
      ageMinutes: Math.floor((Date.parse(this.now()) - Date.parse(fact.updatedAt)) / MINUTE_MS),
      totalVnd: fact.totalVnd,
      reasonCode: stalledReason(fact.status),
    })).sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt) || left.orderId.localeCompare(right.orderId));
    return paginate(result.summary, mapped, bound.limit, this.now(), "stalled", (item) => [
      item.updatedAt, item.orderId,
    ]);
  }

  async invalidStateEvidence(input: OrderHealthWindow): Promise<OrderInvalidStateResult> {
    const bound = validateWindow(input);
    const after = decodeAfter(input.cursor, this.now(), "invalid-state");
    const result = await this.read((session) => this.repository.readInvalidStateEvidence(session, {
      ...input,
      asOf: this.now(),
      limit: bound.limit + 1,
      ...(after === undefined ? {} : { after }),
    }));
    const summary = {
      invalidCount: result.summary.invalidCount,
      reasonCounts: orderReasonCounts(result.summary.reasonCounts),
    };
    assertSafe(summary);
    const mapped = result.evidence.map((evidence) => ({
      orderId: evidence.orderId,
      status: evidence.status,
      version: evidence.version,
      detectedAt: evidence.detectedAt,
      reasonCodes: orderReasons(evidence.reasonCodes),
    }));
    return paginate(summary, mapped, bound.limit, this.now(), "invalid-state", (item) => [
      item.detectedAt, item.orderId,
    ]);
  }

  async expiryRisk(input: OrderExpiryRiskInput): Promise<OrderExpiryRiskResult> {
    const bound = validateWindow(input);
    const horizonMinutes = input.horizonMinutes ?? 120;
    if (!Number.isInteger(horizonMinutes) || horizonMinutes < 15 || horizonMinutes > 1_440) {
      invalid("Order expiry horizon is invalid");
    }
    const after = decodeAfter(input.cursor, this.now(), "expiry-risk");
    const result = await this.read((session) => this.repository.readExpiryRisk(session, {
      ...input,
      asOf: this.now(),
      limit: bound.limit + 1,
      horizonMinutes,
      ...(after === undefined ? {} : { after }),
    }));
    assertSafe(result.summary);
    const mapped = result.evidence.map((fact) => ({
      orderId: fact.orderId,
      status: fact.status,
      totalVnd: fact.totalVnd,
      reservationExpiresAt: fact.reservationExpiresAt,
      minutesRemaining: Math.max(
        0,
        Math.floor((Date.parse(fact.reservationExpiresAt) - Date.parse(this.now())) / MINUTE_MS),
      ),
    }));
    return paginate(result.summary, mapped, bound.limit, this.now(), "expiry-risk", (item) => [
      item.reservationExpiresAt, item.orderId,
    ]);
  }

  async getAuthorizedContext(orderId: string): Promise<SupportOrderContext | undefined> {
    if (!/^[a-f0-9-]{36}$/i.test(orderId)) invalid("Support Order ID is invalid");
    const fact = await this.read((session) => this.repository.findSupportContext(session, orderId));
    if (fact === undefined) return undefined;
    assertSafe(fact.totalVnd);
    return {
      orderId: fact.orderId,
      status: fact.status,
      createdAt: fact.createdAt,
      reservationExpiresAt: fact.reservationExpiresAt,
      totalVnd: fact.totalVnd,
      backendConfirmedPaid: fact.paidAt !== undefined && isPaidState(fact.status),
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

function validateWindow(input: OrderHealthWindow) {
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  const limit = input.limit ?? 25;
  if (
    !Number.isFinite(start) || !Number.isFinite(end)
    || end <= start || end - start > 90 * DAY_MS
  ) invalid("Order health window is invalid");
  if (input.timezone !== "Asia/Ho_Chi_Minh") invalid("Order health timezone is invalid");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid("Order evidence limit is invalid");
  return { limit };
}

function stalledReason(status: OrderStatus): OrderStalledReason {
  if (status === "paid") return "PAID_NOT_PROCESSING";
  if (status === "processing") return "PROCESSING_NOT_READY";
  if (status === "ready_for_fulfillment") return "READY_NOT_COMPLETED";
  return invalid("Order stalled status is invalid");
}

function orderReasons(values: readonly OrderInvalidReason[]): readonly OrderInvalidReason[] {
  return [...new Set(values)].sort(
    (left, right) => invalidReasonOrder.indexOf(left) - invalidReasonOrder.indexOf(right),
  );
}

function orderReasonCounts(
  values: readonly { readonly reasonCode: OrderInvalidReason; readonly count: number }[],
) {
  return [...values].sort(
    (left, right) => invalidReasonOrder.indexOf(left.reasonCode)
      - invalidReasonOrder.indexOf(right.reasonCode),
  );
}

function isPaidState(status: OrderStatus): boolean {
  return ["paid", "processing", "ready_for_fulfillment", "completed"].includes(status);
}

function paginate<Summary, Evidence>(
  summary: Summary,
  allEvidence: readonly Evidence[],
  limit: number,
  now: string,
  kind: string,
  key: (evidence: Evidence) => readonly unknown[],
): { readonly summary: Summary; readonly evidence: readonly Evidence[]; readonly nextCursor?: string } {
  const hasNext = allEvidence.length > limit;
  const evidence = hasNext ? allEvidence.slice(0, limit) : allEvidence;
  const last = evidence.at(-1);
  return {
    summary,
    evidence,
    ...(hasNext && last !== undefined
      ? { nextCursor: encodeCursor(key(last), now, kind) }
      : {}),
  };
}

function encodeCursor(key: readonly unknown[], now: string, kind: string): string {
  return Buffer.from(JSON.stringify({ kind, key, expiresAt: Date.parse(now) + CURSOR_TTL_MS }), "utf8")
    .toString("base64url");
}

function decodeAfter(cursor: string | undefined, now: string, kind: string) {
  if (cursor === undefined) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      kind?: unknown; key?: unknown; expiresAt?: unknown;
    };
    if (
      value.kind !== kind || !Array.isArray(value.key)
      || typeof value.expiresAt !== "number" || Date.parse(now) > value.expiresAt
    ) invalid("Order evidence cursor is invalid or expired");
    return value.key;
  } catch (error) {
    if (error instanceof OrderApplicationError) throw error;
    return invalid("Order evidence cursor is invalid or expired");
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
  throw new OrderApplicationError("VALIDATION_ERROR", message);
}

function unsafe(): never {
  throw new OrderApplicationError("UNSAFE_HEALTH_VALUE", "Order health value is unsafe");
}
