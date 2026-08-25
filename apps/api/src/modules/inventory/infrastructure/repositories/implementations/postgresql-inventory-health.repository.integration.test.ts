// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { runInventoryMigrations } from "../../database/run-inventory-migrations";
import { PostgresqlInventoryHealthRepository } from "./postgresql-inventory-health.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const window = {
  start: "2026-08-13T05:00:00.000Z",
  end: "2026-08-16T06:00:00.000Z",
  asOf: "2026-08-16T05:00:00.000Z",
};

suite("PostgresqlInventoryHealthRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlInventoryHealthRepository();

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE stock_movements,inventory_reservations,inventory_items,
      product_prices,product_variants,products,categories CASCADE`);
    await seedFixture(pool);
  });
  afterAll(async () => {
    await runInventoryMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("reads only bounded current stock facts", async () => {
    await expect(transactions.runReadOnly((session) => repository.readCurrentStock(session)))
      .resolves.toEqual([
        { variantId: "10000000-0000-4000-8000-000000000001", onHand: 0, reserved: 0, available: 0 },
        { variantId: "10000000-0000-4000-8000-000000000002", onHand: 8, reserved: 3, available: 5 },
        { variantId: "10000000-0000-4000-8000-000000000003", onHand: 20, reserved: 0, available: 20 },
      ]);
    await expect(transactions.runReadOnly((session) => repository.readCurrentStock(session, 6)))
      .resolves.toEqual([
        { variantId: "10000000-0000-4000-8000-000000000003", onHand: 20, reserved: 0, available: 20 },
      ]);
  });

  it("classifies anomaly detection instants without returning reservation references", async () => {
    const result = await transactions.runReadOnly((session) =>
      repository.readReservationAnomalies(session, { ...window, limit: 10 }));
    expect(result.summary).toEqual({
      expiredActiveCount: 1,
      finalizedWithoutTimestampCount: 1,
      stalePendingCount: 1,
      affectedUnits: 6,
    });
    expect(result.evidence.map(({ reasonCode }) => reasonCode)).toEqual([
      "EXPIRED_ACTIVE",
      "FINALIZED_TIMESTAMP_MISSING",
      "STALE_PENDING",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/CANARY_REFERENCE|referenceId|reference_id/);
  });

  it("applies the stable detected-at and reservation-id cursor", async () => {
    const result = await transactions.runReadOnly((session) =>
      repository.readReservationAnomalies(session, {
        ...window,
        limit: 10,
        after: {
          detectedAt: "2026-08-14T05:00:00.000Z",
          reservationId: "20000000-0000-4000-8000-000000000001",
        },
      }));
    expect(result.evidence.map(({ reservationId }) => reservationId)).toEqual([
      "20000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000003",
    ]);
  });

  it.skipIf(process.env.RUN_INVENTORY_SCALE !== "1")(
    "uses partial health indexes at 10k inventory rows",
    async () => {
      await pool.query("BEGIN");
      try {
        await seedScaleFixture(pool);
        await pool.query("ANALYZE inventory_items");
        await pool.query("ANALYZE inventory_reservations");
        const stockPlan = await pool.query(`EXPLAIN (FORMAT JSON)
          SELECT variant_id,on_hand,reserved,on_hand-reserved AS available
          FROM inventory_items WHERE on_hand-reserved>=6 ORDER BY variant_id`);
        expect(JSON.stringify(stockPlan.rows)).toContain(
          "inventory_items_available_health_idx",
        );
        const anomalyPlan = await pool.query(`EXPLAIN (FORMAT JSON)
          SELECT id,variant_id,quantity,status,expires_at,finalized_at,updated_at
          FROM inventory_reservations
          WHERE (status<>'active' AND finalized_at IS NULL)
             OR (status='active' AND finalized_at IS NOT NULL)
          ORDER BY updated_at,id`);
        expect(JSON.stringify(anomalyPlan.rows)).toContain(
          "inventory_reservations_finalization_anomaly_idx",
        );
      } finally {
        await pool.query("ROLLBACK");
      }
    },
    30_000,
  );
});

async function seedFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO categories(id,name,slug,status) VALUES
      ('40000000-0000-4000-8000-000000000001','CANARY_CATEGORY','health','active');
    INSERT INTO products(id,category_id,name,slug,description,status) VALUES
      ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','CANARY_PRODUCT','health','CANARY_DESCRIPTION','published');
    INSERT INTO product_variants(id,product_id,sku,title,option_values,status) VALUES
      ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','CANARY-1','CANARY_VARIANT','{}','active'),
      ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','CANARY-2','CANARY_VARIANT','{}','active'),
      ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','CANARY-3','CANARY_VARIANT','{}','active');
    INSERT INTO inventory_items(id,variant_id,on_hand,reserved,version) VALUES
      ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,0,1),
      ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',8,3,1),
      ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',20,0,1);
    INSERT INTO inventory_reservations
      (id,reference_type,reference_id,variant_id,quantity,status,expires_at,
       finalized_at,created_at,updated_at) VALUES
      ('20000000-0000-4000-8000-000000000001','order','CANARY_REFERENCE_EXPIRED','10000000-0000-4000-8000-000000000001',1,'active','2026-08-14T05:00:00Z',NULL,'2026-08-13T05:00:00Z','2026-08-13T05:00:00Z'),
      ('20000000-0000-4000-8000-000000000002','order','CANARY_REFERENCE_MISSING','10000000-0000-4000-8000-000000000002',2,'released','2026-08-15T00:00:00Z',NULL,'2026-08-14T05:00:00Z','2026-08-15T05:00:00Z'),
      ('20000000-0000-4000-8000-000000000003','checkout','CANARY_REFERENCE_STALE','10000000-0000-4000-8000-000000000003',3,'active','2026-08-17T05:00:00Z','2026-08-15T06:00:00Z','2026-08-15T05:00:00Z','2026-08-15T06:00:00Z'),
      ('20000000-0000-4000-8000-000000000004','order','CANARY_REFERENCE_OUTSIDE','10000000-0000-4000-8000-000000000003',4,'released','2026-08-12T00:00:00Z',NULL,'2026-08-11T05:00:00Z','2026-08-12T05:00:00Z');
  `);
}

async function seedScaleFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO product_variants(id,product_id,sku,title,option_values,status)
    SELECT ('11000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '30000000-0000-4000-8000-000000000001','SCALE-'||value,
      'Scale Variant','{}','active'
    FROM generate_series(1,10000) value;
    INSERT INTO inventory_items(id,variant_id,on_hand,reserved,version)
    SELECT ('51000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      ('11000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      CASE WHEN value<=10 THEN 10 ELSE 0 END,0,1
    FROM generate_series(1,10000) value;
    INSERT INTO inventory_reservations
      (id,reference_type,reference_id,variant_id,quantity,status,expires_at,
       finalized_at,created_at,updated_at)
    SELECT ('21000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'order','scale-'||value,
      ('11000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      1,'active','2026-08-20T05:00:00Z',NULL,
      '2026-08-16T05:00:00Z','2026-08-16T05:00:00Z'
    FROM generate_series(1,10000) value;
  `);
}
