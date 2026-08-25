// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CommerceReportDto, CustomerReportDto } from "../dtos/reporting.dto";
import type { CommerceReportFacts, CustomerReportFacts } from "../repositories/interfaces/reporting.repository";
import { ReportingApplicationError } from "../services/reporting-application.error";

export function mapCommerceReport(facts: CommerceReportFacts): CommerceReportDto {
  assertSafeInteger(facts.grossPaidRevenueVnd);
  assertSafeInteger(facts.paidOrderCount);
  assertSafeInteger(facts.createdOrderCount);
  assertSafeInteger(facts.paidCreatedOrderCount);
  assertSafeInteger(facts.previousGrossPaidRevenueVnd);
  assertSafeInteger(facts.previousPaidOrderCount);
  for (const status of facts.paymentStatuses) assertSafeInteger(status.count);
  for (const point of facts.daily) {
    assertDate(point.date);
    assertSafeInteger(point.grossPaidRevenueVnd);
    assertSafeInteger(point.paidOrderCount);
  }

  const averageOrderValueVnd = halfUpDivide(facts.grossPaidRevenueVnd, facts.paidOrderCount);
  const previousAverageOrderValueVnd = halfUpDivide(
    facts.previousGrossPaidRevenueVnd,
    facts.previousPaidOrderCount,
  );

  return {
    grossPaidRevenueVnd: facts.grossPaidRevenueVnd,
    paidOrderCount: facts.paidOrderCount,
    averageOrderValueVnd,
    conversionRateBasisPoints: halfUpDivide(facts.paidCreatedOrderCount * 10_000, facts.createdOrderCount),
    comparison: {
      previousGrossPaidRevenueVnd: facts.previousGrossPaidRevenueVnd,
      previousPaidOrderCount: facts.previousPaidOrderCount,
      previousAverageOrderValueVnd,
      grossPaidRevenueChangeBasisPoints: changeBasisPoints(facts.grossPaidRevenueVnd, facts.previousGrossPaidRevenueVnd),
      paidOrderCountChangeBasisPoints: changeBasisPoints(facts.paidOrderCount, facts.previousPaidOrderCount),
      averageOrderValueChangeBasisPoints: changeBasisPoints(averageOrderValueVnd, previousAverageOrderValueVnd),
    },
    daily: facts.daily.map((point) => ({ ...point })),
    paymentStatuses: facts.paymentStatuses.map((status) => ({ ...status })),
  };
}

export function mapCustomerReport(facts: CustomerReportFacts): CustomerReportDto {
  assertSafeInteger(facts.totalRegisteredCustomers);
  assertSafeInteger(facts.repeatCustomers);
  assertSafeInteger(facts.lifetimeValueVnd);
  assertSafeInteger(facts.newCustomersInRange);
  assertSafeInteger(facts.previousNewCustomersInRange);
  for (const bucket of facts.lifetimeValueBuckets) assertSafeInteger(bucket.count);
  for (const point of facts.dailyNewCustomers) {
    assertDate(point.date);
    assertSafeInteger(point.newCustomerCount);
  }
  return {
    totalRegisteredCustomers: facts.totalRegisteredCustomers,
    repeatCustomers: facts.repeatCustomers,
    lifetimeValueVnd: facts.lifetimeValueVnd,
    lifetimeValueBuckets: facts.lifetimeValueBuckets.map((bucket) => ({ ...bucket })),
    newCustomersInRange: facts.newCustomersInRange,
    previousNewCustomersInRange: facts.previousNewCustomersInRange,
    newCustomersChangeBasisPoints: changeBasisPoints(facts.newCustomersInRange, facts.previousNewCustomersInRange),
    dailyNewCustomers: facts.dailyNewCustomers.map((point) => ({ ...point })),
  };
}

export function assertReportingDtoSafe(value: unknown): void {
  if (typeof value === "number") {
    assertSafeInteger(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertReportingDtoSafe(item);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) assertReportingDtoSafe(item);
  }
}

function assertSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ReportingApplicationError(
      "UNSAFE_REPORTING_VALUE",
      "Reporting aggregate is outside safe integer bounds",
    );
  }
}

function assertSignedSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new ReportingApplicationError(
      "UNSAFE_REPORTING_VALUE",
      "Reporting aggregate is outside safe integer bounds",
    );
  }
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReportingApplicationError("UNSAFE_REPORTING_VALUE", "Reporting daily date is invalid");
  }
}

function changeBasisPoints(current: number, previous: number): number | null {
  assertSafeInteger(current);
  assertSafeInteger(previous);
  if (previous === 0) return current === 0 ? 0 : null;
  const numerator = BigInt(current - previous) * 10_000n;
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = sign * ((absolute * 2n + BigInt(previous)) / (2n * BigInt(previous)));
  const value = Number(rounded);
  assertSignedSafeInteger(value);
  return value;
}

function halfUpDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  assertSafeInteger(numerator);
  assertSafeInteger(denominator);
  const rounded = (BigInt(numerator) * 2n + BigInt(denominator)) /
    (2n * BigInt(denominator));
  const value = Number(rounded);
  assertSafeInteger(value);
  return value;
}
