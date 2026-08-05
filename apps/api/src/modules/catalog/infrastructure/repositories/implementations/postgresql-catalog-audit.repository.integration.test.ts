// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CatalogAuditEntry } from "../../../application/repositories/interfaces/catalog-audit.repository";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { PostgresqlCatalogAuditRepository } from "./postgresql-catalog-audit.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("PostgresqlCatalogAuditRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlCatalogAuditRepository();
  const entry: CatalogAuditEntry = {
    id: "audit_product_created",
    actorId: "user_catalog",
    action: "catalog.product.created",
    resourceType: "product",
    resourceId: "product_bottle",
    outcome: "success",
    correlationId: "corr_product_created",
    metadata: { changedFields: ["name"] },
    occurredAt: "2026-08-05T00:00:00.000Z",
  };

  beforeAll(async () => runCatalogMigrations(databaseUrl!, "up"));
  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("appends and maps audit entries through the caller transaction", async () => {
    await transactions.run((session) => repository.append(session, entry));
    const listed = await transactions.runReadOnly((session) =>
      repository.listByResource(session, "product", "product_bottle"),
    );
    expect(listed).toEqual([entry]);
  });

  it("rolls back audit writes with the surrounding mutation", async () => {
    await expect(
      transactions.run(async (session) => {
        await repository.append(session, {
          ...entry,
          id: "audit_rolled_back",
          correlationId: "corr_rolled_back",
        });
        throw new Error("mutation failed");
      }),
    ).rejects.toThrow("mutation failed");

    const result = await pool.query(
      "SELECT id FROM audit_events WHERE id = 'audit_rolled_back'",
    );
    expect(result.rowCount).toBe(0);
  });
});
