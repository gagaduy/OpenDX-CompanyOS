// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations, runCrmMigrations } from "../../../../shared/database/run-migrations";
import { runCartMigrations } from "../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../../promotion/infrastructure/database/run-promotion-migrations";
import { runSupportMigrations } from "../../../support/infrastructure/database/run-support-migrations";
import { runReportingMigrations } from "./run-reporting-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const analyticsUrl = process.env.AGENTIC_ANALYTICS_TEST_DATABASE_URL
  ?? "postgres://opendx_agentic_reader:opendx_agentic_reader_password@localhost:5432/opendx_test";
const views = [
  "reporting_agentic_variant_sales_v1",
  "reporting_agentic_customer_segment_snapshot_v1",
  "reporting_agentic_customer_segment_snapshot_v2",
  "reporting_agentic_customer_activity_daily_v1",
] as const;
const approvedReaderViews = [
  "reporting_agentic_variant_sales_v1",
  "reporting_agentic_customer_segment_snapshot_v2",
  "reporting_agentic_customer_activity_daily_v1",
] as const;

suite("Reporting Agentic analytics migration", () => {
  const app = new Pool({ connectionString: databaseUrl });
  const reader = new Pool({ connectionString: analyticsUrl });

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
    await runPaymentMigrations(databaseUrl!, "up");
    await runCrmMigrations(databaseUrl!, "up");
    await runSupportMigrations(databaseUrl!, "up");
    await runReportingMigrations(databaseUrl!, "up");
  });
  afterAll(async () => {
    await runReportingMigrations(databaseUrl!, "down", 999_999);
    await runSupportMigrations(databaseUrl!, "down", 999_999);
    await runCrmMigrations(databaseUrl!, "down", 999_999);
    await runPaymentMigrations(databaseUrl!, "down", 999_999);
    await runOrderMigrations(databaseUrl!, "down", 999_999);
    await runCheckoutMigrations(databaseUrl!, "down", 999_999);
    await runPromotionMigrations(databaseUrl!, "down", 999_999);
    await runCartMigrations(databaseUrl!, "down", 999_999);
    await runCustomerMigrations(databaseUrl!, "down", 999_999);
    await runInventoryMigrations(databaseUrl!, "down", 999_999);
    await runCompanyCoreMigrations(databaseUrl!, "down", 999_999);
    await runCatalogMigrations(databaseUrl!, "down", 999_999);
    await reader.end();
    await app.end();
  });

  it("creates four security-barrier views and reapplies the latest projection reversibly", async () => {
    const options = await app.query<{ relname: string; options: readonly string[] }>(
      `SELECT class.relname,class.reloptions AS options
       FROM pg_class class WHERE class.relname=ANY($1::text[]) ORDER BY class.relname`,
      [views],
    );
    expect(options.rows).toHaveLength(4);
    expect(options.rows.every(({ options: values }) => values.includes("security_barrier=true")))
      .toBe(true);

    await runReportingMigrations(databaseUrl!, "down", 1);
    expect((await app.query(
      "SELECT to_regclass('public.reporting_agentic_customer_segment_snapshot_v2') AS name",
    )).rows[0]).toEqual({ name: null });
    await runReportingMigrations(databaseUrl!, "up");
  });

  it("allows only exact view reads for the analytics role", async () => {
    for (const view of approvedReaderViews) {
      await expect(reader.query(`SELECT * FROM ${view} LIMIT 1`)).resolves.toBeDefined();
    }
    await expect(reader.query(
      "SELECT * FROM reporting_agentic_customer_segment_snapshot_v1 LIMIT 1",
    )).rejects.toThrow(/permission denied/i);
    const grants = await app.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name,privilege_type
       FROM information_schema.role_table_grants
       WHERE grantee='opendx_agentic_reader'
       ORDER BY table_name,privilege_type`,
    );
    expect(grants.rows).toEqual(approvedReaderViews
      .map((tableName) => ({ table_name: tableName, privilege_type: "SELECT" }))
      .sort((left, right) => left.table_name.localeCompare(right.table_name)));
    await expect(reader.query("SELECT * FROM orders LIMIT 1"))
      .rejects.toThrow(/permission denied/i);
    await expect(reader.query(
      "UPDATE reporting_agentic_variant_sales_v1 SET paid_quantity=0",
    )).rejects.toThrow();
    await expect(reader.query("CREATE TEMP TABLE leak(value text)"))
      .rejects.toThrow(/permission denied/i);
    await expect(reader.query("CREATE TABLE public.leak(value text)"))
      .rejects.toThrow(/permission denied/i);
  });

  it("does not inherit future relation or function privileges", async () => {
    await app.query("DROP TABLE IF EXISTS reporting_future_canary");
    await app.query("CREATE TABLE reporting_future_canary(value text)");
    await app.query("CREATE OR REPLACE FUNCTION reporting_future_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
    await expect(reader.query("SELECT * FROM reporting_future_canary"))
      .rejects.toThrow(/permission denied/i);
    await expect(reader.query("SELECT reporting_future_function()"))
      .rejects.toThrow(/permission denied/i);
    await app.query("DROP TABLE reporting_future_canary");
    await app.query("DROP FUNCTION reporting_future_function()");
  });

  it("keeps PUBLIC unable to read the approved views", async () => {
    const result = await app.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('public',$1,'SELECT') AS allowed`,
      [views[0]],
    );
    expect(result.rows[0]?.allowed).toBe(false);
  });
});
