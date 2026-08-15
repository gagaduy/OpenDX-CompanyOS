// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SupportOrderContextReader } from "../../../../order";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import { SupportApplicationError } from "../support-application.error";
import type {
  SupportClassificationSummary,
  SupportHealthReader,
  SupportHealthRepository,
  SupportHealthWindow,
  SupportOperationalClass,
  SupportOrderReferenceReader,
  SupportRelatedOrderResult,
  SupportSlaRiskInput,
  SupportSlaRiskResult,
} from "../interfaces/support-health-reader";
import type { TicketPriority, TicketStatus } from "../../../domain/entities/support-ticket";

const DAY_MS = 86_400_000;
const CURSOR_TTL_MS = 5 * 60_000;
const priorityOrder: readonly TicketPriority[] = ["urgent", "high", "normal", "low"];
const statusOrder: readonly TicketStatus[] = [
  "new", "assigned", "in_progress", "waiting_customer", "waiting_internal",
  "escalated", "resolved", "closed",
];
const classOrder: readonly SupportOperationalClass[] = [
  "unassigned", "active_work", "waiting_customer", "waiting_internal", "escalated", "terminal",
];

export class SupportHealthReaderService implements SupportHealthReader, SupportOrderReferenceReader {
  constructor(
    private readonly repository: SupportHealthRepository,
    private readonly orders: SupportOrderContextReader,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async slaRisk(input: SupportSlaRiskInput): Promise<SupportSlaRiskResult> {
    const { asOf, limit } = validate(input, this.now());
    const horizonMinutes = input.horizonMinutes ?? 240;
    if (!Number.isInteger(horizonMinutes) || horizonMinutes < 15 || horizonMinutes > 1_440) {
      invalid("Support SLA horizon is invalid");
    }
    const after = decodeCursor(input.cursor, asOf);
    const result = await this.read((session) => this.repository.readSlaRisk(session, {
      ...input,
      asOf,
      horizonMinutes,
      limit: limit + 1,
      ...(after === undefined ? {} : { after }),
    }));
    const mapped = result.evidence.map((fact) => {
      const remaining = Math.floor((Date.parse(fact.slaDueAt) - Date.parse(asOf)) / 60_000);
      if (!Number.isSafeInteger(remaining)) unsafe();
      return {
        ticketId: fact.ticketId,
        priority: fact.priority,
        status: fact.status,
        slaDueAt: fact.slaDueAt,
        minutesRemaining: remaining,
        riskCode: remaining <= 0 ? "BREACHED" as const : "DUE_WITHIN_HORIZON" as const,
      };
    });
    const hasNext = mapped.length > limit;
    const evidence = hasNext ? mapped.slice(0, limit) : mapped;
    const last = evidence.at(-1);
    const summary = {
      ...result.summary,
      countsByPriority: sort(result.summary.countsByPriority, priorityOrder, "priority"),
    };
    assertSafe(summary);
    return {
      summary,
      evidence,
      ...(hasNext && last !== undefined
        ? { nextCursor: encodeCursor([last.slaDueAt, last.ticketId], asOf) }
        : {}),
    };
  }

  async classificationSummary(input: SupportHealthWindow): Promise<SupportClassificationSummary> {
    const { asOf } = validate(input, this.now());
    const result = await this.read((session) =>
      this.repository.readClassificationSummary(session, { ...input, asOf }));
    const mapped = {
      ...result,
      countsByPriority: sort(result.countsByPriority, priorityOrder, "priority"),
      countsByStatus: sort(result.countsByStatus, statusOrder, "status"),
      operationalClasses: sort(result.operationalClasses, classOrder, "class"),
    };
    assertSafe(mapped);
    return mapped;
  }

  async findRelatedOrder(ticketId: string): Promise<SupportRelatedOrderResult> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
      invalid("Support ticket identity is invalid");
    }
    const reference = await this.read((session) => this.repository.findRelatedOrderId(session, ticketId));
    if (!reference.found) throw new SupportApplicationError("TICKET_NOT_FOUND", "Support ticket not found");
    if (reference.orderId === null) return { ticketId, hasRelatedOrder: false };
    const order = await this.orders.getAuthorizedContext(reference.orderId);
    if (order === undefined) unsafe();
    return {
      ticketId,
      hasRelatedOrder: true,
      orderId: order.orderId,
      orderStatus: order.status,
      orderCreatedAt: order.createdAt,
      reservationExpiresAt: order.reservationExpiresAt,
      totalVnd: order.totalVnd,
      paymentConfirmed: order.backendConfirmedPaid,
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

function validate(input: SupportHealthWindow, asOf: string) {
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  const current = Date.parse(asOf);
  const limit = input.limit ?? 25;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
    || end - start > 90 * DAY_MS || !Number.isFinite(current)) invalid("Support health window is invalid");
  if (input.timezone !== "Asia/Ho_Chi_Minh") invalid("Support health timezone is invalid");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid("Support evidence limit is invalid");
  return { asOf, limit };
}

function sort<Row, Key extends keyof Row>(rows: readonly Row[], order: readonly Row[Key][], key: Key) {
  return [...rows].sort((left, right) => order.indexOf(left[key]) - order.indexOf(right[key]));
}

function assertSafe(value: unknown): void {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) unsafe();
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) assertSafe(child);
  }
}

function encodeCursor(key: readonly unknown[], now: string): string {
  return Buffer.from(JSON.stringify({ kind: "support-sla", key, expiresAt: Date.parse(now) + CURSOR_TTL_MS }))
    .toString("base64url");
}

function decodeCursor(cursor: string | undefined, now: string): readonly unknown[] | undefined {
  if (cursor === undefined) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      kind?: unknown; key?: unknown; expiresAt?: unknown;
    };
    if (value.kind !== "support-sla" || !Array.isArray(value.key)
      || typeof value.expiresAt !== "number" || Date.parse(now) > value.expiresAt) {
      invalid("Support evidence cursor is invalid or expired");
    }
    return value.key;
  } catch (error) {
    if (error instanceof SupportApplicationError) throw error;
    return invalid("Support evidence cursor is invalid or expired");
  }
}

function invalid(message: string): never {
  throw new SupportApplicationError("VALIDATION_ERROR", message);
}

function unsafe(): never {
  throw new SupportApplicationError("UNSAFE_HEALTH_VALUE", "Support health value is unsafe");
}
