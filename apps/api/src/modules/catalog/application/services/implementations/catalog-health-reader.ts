// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { CatalogApplicationError } from "../catalog-application.error";
import type {
  CatalogHealthReader,
  CatalogHealthRepository,
  CatalogMerchandisingSummary,
  CatalogProductCompleteness,
  CatalogPublicationEvidence,
  CatalogPublicationReadinessInput,
  CatalogPublicationReadinessResult,
  CatalogReadinessReason,
} from "../interfaces/catalog-health-reader";

const reasonOrder: readonly CatalogReadinessReason[] = [
  "MISSING_BRAND",
  "EMPTY_ATTRIBUTES",
  "NO_ACTIVE_VARIANT",
  "MISSING_CURRENT_PRICE",
  "NO_MEDIA",
  "PRIMARY_MEDIA_INVALID",
];

export class CatalogHealthReaderService implements CatalogHealthReader {
  constructor(
    private readonly repository: CatalogHealthRepository,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async productCompleteness(asOf: string): Promise<CatalogProductCompleteness> {
    assertTimestamp(asOf);
    const result = await this.transactions.runReadOnly((session) =>
      this.repository.readProductCompleteness(session, asOf));
    assertSafeNumbers(result);
    return result;
  }

  async publicationReadiness(
    input: CatalogPublicationReadinessInput,
  ): Promise<CatalogPublicationReadinessResult> {
    const limit = input.limit ?? 25;
    assertWindow(input.start, input.end);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid("Catalog evidence limit is invalid");
    const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const result = await this.transactions.runReadOnly((session) =>
      this.repository.readPublicationReadiness(session, {
        start: input.start,
        end: input.end,
        asOf: this.now(),
        limit: limit + 1,
        ...(after === undefined ? {} : { after }),
      }));
    assertSafeNumbers(result);
    const orderedSummary = {
      ...result.summary,
      reasonCounts: orderReasonCounts(result.summary.reasonCounts),
    };
    const orderedEvidence = result.evidence.map((evidence) => ({
      ...evidence,
      reasonCodes: orderReasons(evidence.reasonCodes),
    }));
    const hasNext = orderedEvidence.length > limit;
    const evidence = hasNext ? orderedEvidence.slice(0, limit) : orderedEvidence;
    const last = evidence.at(-1);
    return {
      summary: orderedSummary,
      evidence,
      ...(hasNext && last !== undefined ? { nextCursor: encodeCursor(last) } : {}),
    };
  }

  async merchandisingSummary(asOf: string): Promise<CatalogMerchandisingSummary> {
    assertTimestamp(asOf);
    const result = await this.transactions.runReadOnly((session) =>
      this.repository.readMerchandisingSummary(session, asOf));
    assertSafeNumbers(result);
    if (result.categoryDistribution.length > 25) {
      invalid("Catalog category distribution exceeds its bound");
    }
    return result;
  }
}

function orderReasonCounts(
  values: readonly { readonly reasonCode: CatalogReadinessReason; readonly count: number }[],
) {
  return [...values].sort(
    (left, right) => reasonOrder.indexOf(left.reasonCode) - reasonOrder.indexOf(right.reasonCode),
  );
}

function orderReasons(values: readonly CatalogReadinessReason[]): readonly CatalogReadinessReason[] {
  return [...values].sort((left, right) => reasonOrder.indexOf(left) - reasonOrder.indexOf(right));
}

function encodeCursor(evidence: CatalogPublicationEvidence): string {
  return Buffer.from(JSON.stringify([evidence.updatedAt, evidence.productId]), "utf8")
    .toString("base64url");
}

function decodeCursor(cursor: string): { readonly updatedAt: string; readonly productId: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      !Array.isArray(value) || value.length !== 2
      || typeof value[0] !== "string" || typeof value[1] !== "string"
      || !Number.isFinite(Date.parse(value[0]))
      || !/^[a-f0-9-]{36}$/i.test(value[1])
    ) invalid("Catalog evidence cursor is invalid");
    return { updatedAt: value[0], productId: value[1] };
  } catch (error) {
    if (error instanceof CatalogApplicationError) throw error;
    return invalid("Catalog evidence cursor is invalid");
  }
}

function assertWindow(startValue: string, endValue: string): void {
  const start = Date.parse(startValue);
  const end = Date.parse(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    invalid("Catalog health window is invalid");
  }
}

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) invalid("Catalog snapshot time is invalid");
}

function assertSafeNumbers(value: unknown): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) invalid("Catalog health total is unsafe");
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) assertSafeNumbers(child);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) assertSafeNumbers(child);
  }
}

function invalid(message: string): never {
  throw new CatalogApplicationError("VALIDATION_ERROR", message);
}
