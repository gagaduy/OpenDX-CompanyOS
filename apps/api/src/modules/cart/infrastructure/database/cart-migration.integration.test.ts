// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../shared/database/run-migrations";
import { runCustomerMigrations } from "../../../customer/infrastructure/database/run-customer-migrations";
import { runCartMigrations } from "./run-cart-migrations";
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
suite("cart migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
  });
  afterAll(async () => {
    await runCartMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCustomerMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });
  it("creates owner, item, active-cart, and resolution constraints then rolls back", async () => {
    await runCartMigrations(databaseUrl!, "up");
    const constraints = await pool.query<{ constraint_name: string }>(
      "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name IN ('carts','cart_items','cart_resolution_requests')",
    );
    const names = constraints.rows.map(
      ({ constraint_name }) => constraint_name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "carts_exactly_one_owner_check",
        "cart_items_cart_variant_unique",
        "cart_resolution_requests_customer_key_unique",
      ]),
    );
    await runCartMigrations(databaseUrl!, "down", 1);
    expect(
      (await pool.query("SELECT to_regclass('public.carts') AS name")).rows[0],
    ).toEqual({ name: null });
  });
});
