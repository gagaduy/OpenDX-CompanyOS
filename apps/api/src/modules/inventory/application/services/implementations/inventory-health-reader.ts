// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticAnalyticsReader, AgenticVariantSales } from "../../../../reporting";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { InventoryApplicationError } from "../inventory-application.error";
import type {
  InventoryCurrentStockFact,
  InventoryHealthReader,
  InventoryHealthRepository,
  InventoryHealthWindow,
  InventoryReservationAnomaly,
  InventoryReservationAnomalyResult,
  InventorySlowStockInput,
  InventorySlowStockResult,
  InventoryStockRiskCode,
  InventoryStockRiskInput,
  InventoryStockRiskResult,
} from "../interfaces/inventory-health-reader";

const DAY_MS = 24 * 60 * 60 * 1_000;
const CURSOR_TTL_MS = 5 * 60 * 1_000;

export class InventoryHealthReaderService implements InventoryHealthReader {
  constructor(
    private readonly repository: InventoryHealthRepository,
    private readonly analytics: AgenticAnalyticsReader,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async stockRisk(input: InventoryStockRiskInput): Promise<InventoryStockRiskResult> {
    const bounds = validate(input);
    const threshold = input.lowStockThreshold ?? 5;
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
      invalid("Inventory low-stock threshold is invalid");
    }
    const [stocks, sales] = await Promise.all([
      this.readCurrentStock(),
      this.analytics.getVariantSales(input),
    ]);
    const salesByVariant = aggregateSales(sales);
    const evidence = stocks.flatMap((stock) => {
      const quantitySold = salesByVariant.get(stock.variantId)?.quantitySold ?? 0;
      const dailyVelocityMilliunits = Math.floor(quantitySold * 1_000 / bounds.windowDays);
      const daysCover = dailyVelocityMilliunits === 0
        ? null
        : Math.floor(stock.available * 1_000 / dailyVelocityMilliunits);
      const riskCode = risk(stock, threshold, dailyVelocityMilliunits, daysCover);
      return riskCode === undefined ? [] : [{
        ...stock,
        quantitySold,
        dailyVelocityMilliunits,
        daysCover,
        riskCode,
      }];
    }).sort(compareRisk);
    const summary = {
      trackedVariants: stocks.length,
      lowStockCount: stocks.filter(({ available }) => available > 0 && available <= threshold).length,
      soldOutCount: stocks.filter(({ available }) => available === 0).length,
      unitsOnHand: sum(stocks.map(({ onHand }) => onHand)),
      unitsReserved: sum(stocks.map(({ reserved }) => reserved)),
      unitsAvailable: sum(stocks.map(({ available }) => available)),
    };
    assertSafe(summary);
    return pageEvidence(summary, evidence, bounds.limit, input.cursor, this.now(), "stock-risk");
  }

  async slowStock(input: InventorySlowStockInput): Promise<InventorySlowStockResult> {
    const bounds = validate(input);
    const minimumOnHand = input.minimumOnHand ?? 1;
    if (!Number.isInteger(minimumOnHand) || minimumOnHand < 1 || minimumOnHand > 10_000) {
      invalid("Inventory slow-stock minimum is invalid");
    }
    const [stocks, sales] = await Promise.all([
      this.readCurrentStock(minimumOnHand),
      this.analytics.getVariantSales(input),
    ]);
    const salesByVariant = aggregateSales(sales);
    const evidence = stocks.flatMap((stock) => {
      const sale = salesByVariant.get(stock.variantId);
      if (stock.available < minimumOnHand || sale === undefined || sale.quantitySold !== 0) return [];
      const stockValueVnd = multiply(stock.available, sale.currentUnitPriceVnd);
      return [{
        variantId: stock.variantId,
        available: stock.available,
        quantitySold: 0 as const,
        currentUnitPriceVnd: sale.currentUnitPriceVnd,
        stockValueVnd,
        reasonCode: "NO_SALES_VELOCITY" as const,
      }];
    }).sort((left, right) =>
      right.available - left.available || left.variantId.localeCompare(right.variantId));
    const summary = {
      candidateCount: evidence.length,
      candidateUnits: sum(evidence.map(({ available }) => available)),
      candidateValueVnd: sum(evidence.map(({ stockValueVnd }) => stockValueVnd)),
    };
    assertSafe(summary);
    return pageEvidence(summary, evidence, bounds.limit, input.cursor, this.now(), "slow-stock");
  }

  async reservationAnomalies(
    input: InventoryHealthWindow,
  ): Promise<InventoryReservationAnomalyResult> {
    const bounds = validate(input);
    const after = input.cursor === undefined
      ? undefined
      : decodeCursor(input.cursor, this.now(), "reservation-anomaly");
    const result = await this.transactions.runReadOnly(async (session) => {
      await session.query("SET LOCAL statement_timeout = '750ms'");
      await session.query("SET LOCAL lock_timeout = '100ms'");
      return this.repository.readReservationAnomalies(session, {
        start: input.start,
        end: input.end,
        asOf: this.now(),
        limit: bounds.limit + 1,
        ...(after === undefined ? {} : {
          after: { detectedAt: String(after[0]), reservationId: String(after[1]) },
        }),
      });
    });
    assertSafe(result.summary);
    const mapped = result.evidence.map(mapAnomaly);
    const hasNext = mapped.length > bounds.limit;
    const evidence = hasNext ? mapped.slice(0, bounds.limit) : mapped;
    const last = evidence.at(-1);
    return {
      summary: result.summary,
      evidence,
      ...(hasNext && last !== undefined ? {
        nextCursor: encodeCursor(
          [last.detectedAt, last.reservationId],
          this.now(),
          "reservation-anomaly",
        ),
      } : {}),
    };
  }

  private readCurrentStock(minimumAvailable?: number): Promise<readonly InventoryCurrentStockFact[]> {
    return this.transactions.runReadOnly(async (session) => {
      await session.query("SET LOCAL statement_timeout = '750ms'");
      await session.query("SET LOCAL lock_timeout = '100ms'");
      return this.repository.readCurrentStock(session, minimumAvailable);
    });
  }
}

function validate(input: InventoryHealthWindow) {
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  const limit = input.limit ?? 25;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 90 * DAY_MS) {
    invalid("Inventory health window is invalid");
  }
  if (input.timezone !== "Asia/Ho_Chi_Minh") invalid("Inventory health timezone is invalid");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalid("Inventory evidence limit is invalid");
  }
  return { windowDays: (end - start) / DAY_MS, limit };
}

function aggregateSales(values: readonly AgenticVariantSales[]) {
  const result = new Map<string, { quantitySold: number; currentUnitPriceVnd: number }>();
  for (const value of values) {
    const current = result.get(value.variantId);
    result.set(value.variantId, {
      quantitySold: sum([current?.quantitySold ?? 0, value.paidQuantity]),
      currentUnitPriceVnd: value.currentUnitPriceVnd,
    });
  }
  return result;
}

function risk(
  stock: InventoryCurrentStockFact,
  threshold: number,
  velocity: number,
  daysCover: number | null,
): InventoryStockRiskCode | undefined {
  if (stock.available === 0) return "SOLD_OUT";
  if (stock.available <= threshold) return "LOW_STOCK";
  if (velocity === 0) return "NO_SALES_VELOCITY";
  if (daysCover !== null && daysCover < 14) return "BELOW_14_DAY_COVER";
  return undefined;
}

function compareRisk(
  left: InventoryStockRiskResult["evidence"][number],
  right: InventoryStockRiskResult["evidence"][number],
): number {
  if (left.daysCover === null && right.daysCover !== null) return 1;
  if (left.daysCover !== null && right.daysCover === null) return -1;
  return (left.daysCover ?? 0) - (right.daysCover ?? 0)
    || left.variantId.localeCompare(right.variantId);
}

function pageEvidence<Summary, Evidence extends object>(
  summary: Summary,
  allEvidence: readonly Evidence[],
  limit: number,
  cursor: string | undefined,
  now: string,
  kind: "stock-risk" | "slow-stock",
): { readonly summary: Summary; readonly evidence: readonly Evidence[]; readonly nextCursor?: string } {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, now, kind);
  const start = after === undefined
    ? 0
    : allEvidence.findIndex((entry) => JSON.stringify(cursorKey(entry, kind)) === JSON.stringify(after)) + 1;
  if (after !== undefined && start === 0) invalid("Inventory evidence cursor is stale");
  const selected = allEvidence.slice(start, start + limit);
  const hasNext = start + limit < allEvidence.length;
  const last = selected.at(-1);
  return {
    summary,
    evidence: selected,
    ...(hasNext && last !== undefined
      ? { nextCursor: encodeCursor(cursorKey(last, kind), now, kind) }
      : {}),
  };
}

function cursorKey(value: object, kind: "stock-risk" | "slow-stock"): readonly unknown[] {
  const row = value as Record<string, unknown>;
  return kind === "stock-risk"
    ? [row.daysCover, row.variantId]
    : [row.quantitySold, row.available, row.variantId];
}

function encodeCursor(key: readonly unknown[], now: string, kind: string): string {
  return Buffer.from(JSON.stringify({ kind, key, expiresAt: Date.parse(now) + CURSOR_TTL_MS }), "utf8")
    .toString("base64url");
}

function decodeCursor(cursor: string, now: string, kind: string): readonly unknown[] {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      kind?: unknown; key?: unknown; expiresAt?: unknown;
    };
    if (
      value.kind !== kind || !Array.isArray(value.key)
      || typeof value.expiresAt !== "number" || Date.parse(now) > value.expiresAt
    ) invalid("Inventory evidence cursor is invalid or expired");
    return value.key;
  } catch (error) {
    if (error instanceof InventoryApplicationError) throw error;
    return invalid("Inventory evidence cursor is invalid or expired");
  }
}

function mapAnomaly(value: InventoryReservationAnomaly): InventoryReservationAnomaly {
  return {
    reservationId: value.reservationId,
    variantId: value.variantId,
    quantity: value.quantity,
    status: value.status,
    expiresAt: value.expiresAt,
    detectedAt: value.detectedAt,
    reasonCode: value.reasonCode,
  };
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

function multiply(left: number, right: number): number {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value < 0) return unsafe();
  return value;
}

function assertSafe(value: unknown): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) unsafe();
  } else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) assertSafe(child);
  }
}

function invalid(message: string): never {
  throw new InventoryApplicationError("VALIDATION_ERROR", message);
}

function unsafe(): never {
  throw new InventoryApplicationError("UNSAFE_HEALTH_VALUE", "Inventory health value is unsafe");
}
