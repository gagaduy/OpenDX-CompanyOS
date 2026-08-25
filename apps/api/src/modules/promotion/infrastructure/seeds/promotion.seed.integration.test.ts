// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { runCustomerMigrations } from "../../../customer/infrastructure/database/run-customer-migrations";
import { runPromotionMigrations } from "../database/run-promotion-migrations";
import { promotionFixtures, seedPromotions } from "./promotion.seed";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("NovaCommerce promotion seed", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
  });

  afterAll(async () => {
    await runPromotionMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("seeds one active and one inactive fixture exactly once", async () => {
    await seedPromotions(transactions);
    await seedPromotions(transactions);

    const result = await pool.query<{
      code: string;
      status: string;
      percentage_bps: number | null;
      fixed_amount_vnd: string | null;
    }>(
      `SELECT code, status, percentage_bps, fixed_amount_vnd
       FROM promotions ORDER BY code`,
    );

    expect(result.rows).toEqual([
      {
        code: "NOVA10",
        status: "active",
        percentage_bps: 1_000,
        fixed_amount_vnd: null,
      },
      {
        code: "NOVA50K",
        status: "inactive",
        percentage_bps: null,
        fixed_amount_vnd: "50000",
      },
    ]);
    expect(result.rowCount).toBe(promotionFixtures.length);
    expect(Number((await pool.query(
      "SELECT count(*) FROM audit_events WHERE correlation_id = 'seed:promotion'",
    )).rows[0]?.count)).toBe(promotionFixtures.length);
  });
});
