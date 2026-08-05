// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../shared/database/run-migrations";
import { runInventoryMigrations } from "./run-inventory-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("inventory migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
  });

  afterAll(async () => {
    await runInventoryMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("creates constrained inventory tables and removes them in dependency order", async () => {
    await runInventoryMigrations(databaseUrl!, "up");

    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [["inventory_items", "inventory_reservations", "stock_movements"]],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "inventory_items",
      "inventory_reservations",
      "stock_movements",
    ]);

    const constraints = await pool.query<{ constraint_name: string }>(
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = 'inventory_items'
       ORDER BY constraint_name`,
    );
    expect(constraints.rows.map(({ constraint_name }) => constraint_name)).toEqual(
      expect.arrayContaining([
        "inventory_items_available_check",
        "inventory_items_on_hand_check",
        "inventory_items_reserved_check",
        "inventory_items_variant_id_key",
      ]),
    );

    await runInventoryMigrations(databaseUrl!, "down", 1);
    const removed = await pool.query<{ name: string | null }>(
      "SELECT to_regclass('public.inventory_items')::text AS name",
    );
    expect(removed.rows[0]).toEqual({ name: null });
  });
});
