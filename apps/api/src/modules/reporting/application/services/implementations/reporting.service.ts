// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CommerceReportDto,
  CustomerReportDto,
  OperationsReportDto,
  ProductReportDto,
  ReportingEnvelope,
  ReportingQueryRange,
  ReportingRange,
} from "../../dtos/reporting.dto";
import { assertReportingDtoSafe, mapCommerceReport } from "../../mappers/reporting.mapper";
import type { ReportingRepository } from "../../repositories/interfaces/reporting.repository";
import { ReportingApplicationError } from "../reporting-application.error";
import type { ReportingRequestRange, ReportingServiceContract } from "../interfaces/reporting.service";

const TIMEZONE = "Asia/Ho_Chi_Minh" as const;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportingService implements ReportingServiceContract {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly now: () => string,
  ) {}

  async getCommerce(range: ReportingRequestRange): Promise<ReportingEnvelope<CommerceReportDto>> {
    const resolved = resolveRange(range, this.now());
    return envelope(mapCommerceReport(await this.repository.getCommerce(resolved.query)), resolved.publicRange, this.now());
  }

  async getProducts(range: ReportingRequestRange): Promise<ReportingEnvelope<ProductReportDto>> {
    const resolved = resolveRange(range, this.now());
    const data = await this.repository.getProducts(resolved.query);
    assertReportingDtoSafe(data);
    return envelope(data, resolved.publicRange, this.now());
  }

  async getCustomers(range: ReportingRequestRange): Promise<ReportingEnvelope<CustomerReportDto>> {
    const resolved = resolveRange(range, this.now());
    const data = await this.repository.getCustomers(resolved.query);
    assertReportingDtoSafe(data);
    return envelope(data, resolved.publicRange, this.now());
  }

  async getOperations(range: ReportingRequestRange): Promise<ReportingEnvelope<OperationsReportDto>> {
    const resolved = resolveRange(range, this.now());
    const data = await this.repository.getOperations(resolved.query);
    assertReportingDtoSafe(data);
    return envelope(data, resolved.publicRange, this.now());
  }
}

function envelope<T>(data: T, range: ReportingRange, now: string): ReportingEnvelope<T> {
  return { data, refreshedAt: now, range };
}

function resolveRange(input: ReportingRequestRange, now: string): {
  readonly query: ReportingQueryRange;
  readonly publicRange: ReportingRange;
} {
  const end = input.end ?? addDays(toVietnamDate(now), 1);
  const start = input.start ?? addDays(end, -30);
  validateDate(start);
  validateDate(end);
  const days = daysBetween(start, end);
  if (days <= 0 || days > 366) {
    throw new ReportingApplicationError(
      "INVALID_RANGE",
      "Reporting range must be greater than zero and at most 366 days",
    );
  }

  return {
    query: {
      start: vietnamDateToUtcInstant(start),
      end: vietnamDateToUtcInstant(end),
      timezone: TIMEZONE,
    },
    publicRange: { start, end, timezone: TIMEZONE },
  };
}

function validateDate(value: string): void {
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new ReportingApplicationError("INVALID_RANGE", "Reporting date must use YYYY-MM-DD");
  }
}

function toVietnamDate(instant: string): string {
  return new Date(new Date(instant).getTime() + VIETNAM_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function vietnamDateToUtcInstant(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - VIETNAM_OFFSET_MS).toISOString();
}

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / DAY_MS;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
