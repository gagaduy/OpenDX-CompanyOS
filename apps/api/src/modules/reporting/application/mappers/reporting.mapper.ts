// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CommerceReportDto } from "../dtos/reporting.dto";
import type { CommerceReportFacts } from "../repositories/interfaces/reporting.repository";
import { ReportingApplicationError } from "../services/reporting-application.error";

export function mapCommerceReport(facts: CommerceReportFacts): CommerceReportDto {
  assertSafeInteger(facts.grossPaidRevenueVnd);
  assertSafeInteger(facts.paidOrderCount);
  assertSafeInteger(facts.createdOrderCount);
  assertSafeInteger(facts.paidCreatedOrderCount);
  for (const status of facts.paymentStatuses) assertSafeInteger(status.count);

  return {
    grossPaidRevenueVnd: facts.grossPaidRevenueVnd,
    paidOrderCount: facts.paidOrderCount,
    averageOrderValueVnd: halfUpDivide(facts.grossPaidRevenueVnd, facts.paidOrderCount),
    conversionRateBasisPoints: halfUpDivide(facts.paidCreatedOrderCount * 10_000, facts.createdOrderCount),
    paymentStatuses: facts.paymentStatuses.map((status) => ({ ...status })),
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
