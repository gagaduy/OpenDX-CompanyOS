// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import {
  type DatabaseSession,
  PostgresTransactionRunner,
  type TransactionRunner,
} from "../../../../../shared/database/transaction";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PostgresqlAgenticAnalyticsReader } from "./postgresql-agentic-analytics.reader";

const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: "2026-08-03T00:00:00.000Z",
  timezone: "Asia/Ho_Chi_Minh" as const,
};

describe("PostgresqlAgenticAnalyticsReader", () => {
  it("sets bounded transaction timeouts and maps the three approved views", async () => {
    const queries: { text: string; values?: readonly unknown[] }[] = [];
    const session: DatabaseSession = {
      query: async <Row extends object>(text: string, values?: readonly unknown[]) => {
        queries.push({ text, values });
        let rows: readonly object[];
        if (text.includes("variant_sales")) {
          rows = [{ variant_id: "variant-1", window_date: "2026-08-01", paid_quantity: "2", paid_revenue_vnd: "400000", current_unit_price_vnd: "250000" }];
        } else if (text.includes("segment_snapshot")) {
          rows = [{ segment_key: "repeat", recency_bucket: "0_30_days", customer_count: "3", repeat_customer_count: "2", open_followup_count: "1", lifetime_paid_revenue_vnd: "900000", as_of_date: "2026-08-16" }];
        } else if (text.includes("customer_activity")) {
          rows = [{ activity_date: "2026-08-02", new_customer_count: "4", paid_customer_count: "2", paid_revenue_vnd: "500000" }];
        } else {
          rows = [];
        }
        return { rows: rows as readonly Row[], rowCount: rows.length };
      },
    };
    const transactions: TransactionRunner = {
      run: vi.fn(),
      runReadOnly: async work => work(session),
    };
    const reader = new PostgresqlAgenticAnalyticsReader(transactions);

    await expect(reader.getVariantSales(window)).resolves.toEqual([{
      variantId: "variant-1",
      windowDate: "2026-08-01",
      paidQuantity: 2,
      paidRevenueVnd: 400_000,
      currentUnitPriceVnd: 250_000,
    }]);
    await expect(reader.getCustomerSegmentSnapshot("2026-08-16T05:00:00.000Z"))
      .resolves.toEqual([{
        segmentKey: "repeat",
        recencyBucket: "0_30_days",
        customerCount: 3,
        repeatCustomerCount: 2,
        openFollowupCount: 1,
        lifetimePaidRevenueVnd: 900_000,
        asOfDate: "2026-08-16",
      }]);
    await expect(reader.getCustomerActivity(window)).resolves.toEqual([{
      activityDate: "2026-08-02",
      newCustomerCount: 4,
      paidCustomerCount: 2,
      paidRevenueVnd: 500_000,
    }]);

    expect(queries).toHaveLength(9);
    expect(queries[2]?.text).toMatch(
      /OR \(window_date=CURRENT_DATE AND paid_quantity=0 AND paid_revenue_vnd=0\)/,
    );
    for (let index = 0; index < queries.length; index += 3) {
      expect(queries[index]?.text).toBe("SET LOCAL statement_timeout = '750ms'");
      expect(queries[index + 1]?.text).toBe("SET LOCAL lock_timeout = '100ms'");
      expect(queries[index + 2]?.text).toMatch(/^SELECT/);
    }
  });

  it("rejects mapped output above 256 KiB", async () => {
    const rows = Array.from({ length: 3_000 }, (_, index) => ({
      variant_id: `variant-${index}-${"x".repeat(80)}`,
      window_date: "2026-08-01",
      paid_quantity: "1",
      paid_revenue_vnd: "1",
      current_unit_price_vnd: "1",
    }));
    const session: DatabaseSession = {
      query: async <Row extends object>(text: string) => {
        const selected = text.startsWith("SELECT") ? rows : [];
        return { rows: selected as unknown as readonly Row[], rowCount: selected.length };
      },
    };
    const reader = new PostgresqlAgenticAnalyticsReader({
      run: vi.fn(),
      runReadOnly: async work => work(session),
    });

    await expect(reader.getVariantSales(window)).rejects.toMatchObject({
      code: "UNSAFE_REPORTING_VALUE",
    });
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const analyticsUrl = process.env.AGENTIC_ANALYTICS_TEST_DATABASE_URL
  ?? "postgres://opendx_agentic_reader:opendx_agentic_reader_password@localhost:5432/opendx_test";
const databaseSuite = databaseUrl === undefined ? describe.skip : describe;

databaseSuite("PostgresqlAgenticAnalyticsReader database boundary", () => {
  const pool = new Pool({ connectionString: analyticsUrl });
  const reader = new PostgresqlAgenticAnalyticsReader(new PostgresTransactionRunner(pool));
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1_000);

  afterAll(async () => pool.end());

  it("reads all approved aggregates through the isolated role", async () => {
    const currentWindow = {
      start: start.toISOString(),
      end: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
      timezone: "Asia/Ho_Chi_Minh" as const,
    };

    await expect(reader.getVariantSales(currentWindow)).resolves.toEqual(expect.any(Array));
    await expect(reader.getCustomerSegmentSnapshot(now.toISOString()))
      .resolves.toEqual(expect.any(Array));
    await expect(reader.getCustomerActivity(currentWindow)).resolves.toEqual(expect.any(Array));
  });
});
