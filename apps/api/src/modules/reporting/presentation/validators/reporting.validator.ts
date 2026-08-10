// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ApplicationError } from "../../../../shared/http/application-error";
import type { ReportingRequestRange } from "../../application/services/interfaces/reporting.service";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseReportingRange(query: Record<string, unknown>): ReportingRequestRange {
  const start = optionalDate(query.start);
  const end = optionalDate(query.end);
  if ((start === undefined) !== (end === undefined)) {
    throw validationError();
  }
  if (start !== undefined && end !== undefined) {
    const days = (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / DAY_MS;
    if (days <= 0 || days > 366) throw validationError();
  }
  return { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
}

function optionalDate(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw validationError();
  }
  const parsed = new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10);
  if (parsed !== value) throw validationError();
  return value;
}

function validationError(): ApplicationError {
  return new ApplicationError(400, "VALIDATION_ERROR", "Validation failed");
}
