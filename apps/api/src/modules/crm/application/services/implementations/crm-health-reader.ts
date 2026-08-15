// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticAnalyticsReader, AgenticCustomerSegmentSnapshot } from "../../../../reporting";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { CrmApplicationError } from "../crm-application.error";
import type {
  CrmFollowupHealth,
  CrmHealthReader,
  CrmHealthRepository,
  CrmHealthSegment,
  CrmHealthWindow,
  CrmLifetimeValueBucket,
  CrmRecencyBucket,
  CrmSegmentHealth,
  FollowupOpportunityReason,
} from "../interfaces/crm-health-reader";

const DAY_MS = 86_400_000;
const lifetimeOrder: readonly CrmLifetimeValueBucket[] = ["zero", "low", "mid", "high"];
const recencyOrder: readonly CrmRecencyBucket[] = [
  "0_30_days", "31_90_days", "over_90_days", "never",
];
const segmentOrder: readonly CrmHealthSegment[] = ["new", "repeat", "high_value", "inactive"];

export class CrmHealthReaderService implements CrmHealthReader {
  constructor(
    private readonly repository: CrmHealthRepository,
    private readonly analytics: AgenticAnalyticsReader,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async segmentSummary(input: CrmHealthWindow): Promise<CrmSegmentHealth> {
    const asOf = this.validate(input);
    const [snapshot, activity] = await Promise.all([
      this.analytics.getCustomerSegmentSnapshot(asOf),
      this.analytics.getCustomerActivity(input),
    ]);
    const result = {
      registeredCustomers: sum(activity.map(({ newCustomerCount }) => newCustomerCount)),
      newCustomers: sum(snapshot
        .filter(({ segmentKey }) => segmentKey === "new")
        .map(({ customerCount }) => customerCount)),
      repeatCustomers: sum(snapshot.map(({ repeatCustomerCount }) => repeatCustomerCount)),
      customersByLifetimeValueBucket: aggregate(
        snapshot,
        lifetimeOrder,
        (row) => row.lifetimeValueBucket,
      ),
      customersByRecencyBucket: aggregate(snapshot, recencyOrder, (row) => row.recencyBucket),
      paidRevenueVnd: sum(activity.map(({ paidRevenueVnd }) => paidRevenueVnd)),
    };
    assertSafe(result);
    return result;
  }

  async followupOpportunities(input: CrmHealthWindow): Promise<CrmFollowupHealth> {
    const asOf = this.validate(input);
    const [snapshot, followups] = await Promise.all([
      this.analytics.getCustomerSegmentSnapshot(asOf),
      this.transactions.runReadOnly(async (session) => {
        await session.query("SET LOCAL statement_timeout = '750ms'");
        await session.query("SET LOCAL lock_timeout = '100ms'");
        return this.repository.readFollowupSummary(session, { ...input, asOf });
      }),
    ]);
    const withoutOpen = segmentOrder.map((segment) => ({
      segment,
      count: sum(snapshot.filter(({ segmentKey }) => segmentKey === segment)
        .map((row) => difference(row.customerCount, row.customersWithOpenFollowupCount))),
    })).filter(({ count }) => count > 0);
    const withoutOpenCount = sum(withoutOpen.map(({ count }) => count));
    const reasonCounts = ([
      { reasonCode: "OVERDUE_FOLLOWUP", count: followups.overdueFollowups },
      { reasonCode: "UNASSIGNED_FOLLOWUP", count: followups.unassignedFollowups },
      { reasonCode: "SEGMENT_WITHOUT_OPEN_FOLLOWUP", count: withoutOpenCount },
    ] satisfies readonly {
      readonly reasonCode: FollowupOpportunityReason;
      readonly count: number;
    }[]).filter(({ count }) => count > 0);
    const result = {
      openFollowups: followups.openFollowups,
      overdueFollowups: followups.overdueFollowups,
      unassignedFollowups: followups.unassignedFollowups,
      customersWithoutOpenFollowupBySegment: withoutOpen,
      reasonCounts,
    };
    assertSafe(result);
    return result;
  }

  private validate(input: CrmHealthWindow): string {
    const now = this.now();
    const start = Date.parse(input.start);
    const end = Date.parse(input.end);
    const current = Date.parse(now);
    if (
      !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(current)
      || end <= start || end - start > 90 * DAY_MS || end > current + 60_000
    ) invalid("CRM health window is invalid");
    if (input.timezone !== "Asia/Ho_Chi_Minh") invalid("CRM health timezone is invalid");
    return now;
  }
}

function aggregate<Value extends CrmLifetimeValueBucket | CrmRecencyBucket>(
  rows: readonly AgenticCustomerSegmentSnapshot[],
  order: readonly Value[],
  select: (row: AgenticCustomerSegmentSnapshot) => Value,
): readonly { readonly bucket: Value; readonly count: number }[] {
  return order.map((bucket) => ({
    bucket,
    count: sum(rows.filter((row) => select(row) === bucket)
      .map(({ customerCount }) => customerCount)),
  })).filter(({ count }) => count > 0);
}

function sum(values: readonly number[]): number {
  let result = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) unsafe();
    result += value;
    if (!Number.isSafeInteger(result)) unsafe();
  }
  return result;
}

function difference(total: number, matched: number): number {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(matched) || matched < 0 || matched > total) {
    return unsafe();
  }
  return total - matched;
}

function assertSafe(value: unknown): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) unsafe();
  } else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) assertSafe(child);
  }
}

function invalid(message: string): never {
  throw new CrmApplicationError("VALIDATION_ERROR", message);
}

function unsafe(): never {
  throw new CrmApplicationError("UNSAFE_HEALTH_VALUE", "CRM health value is unsafe");
}
