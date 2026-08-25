// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../../../../app";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { PostgresqlCompanyOperatingCoreRepository } from "../../infrastructure/repositories/implementations/postgresql-company-operating-core.repository";
import { seedNovaCommercePostgresql } from "../../infrastructure/seeds/nova-commerce-postgresql.seed";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("Company Operating Core PostgreSQL API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlCompanyOperatingCoreRepository(transactions);
  let snapshotReads = 0;
  const app = createApiApp({
    companyOperatingCoreRepository: {
      getSnapshot: async () => {
        snapshotReads += 1;
        return repository.getSnapshot();
      },
      listDepartments: () => repository.listDepartments(),
      listTasks: () => repository.listTasks(),
      listEvents: () => repository.listEvents(),
      listApprovals: () => repository.listApprovals(),
    },
  });

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await seedNovaCommercePostgresql(transactions);
  });

  afterAll(async () => {
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("preserves every documented read-only response without infrastructure fields", async () => {
    const responses = await Promise.all([
      request(app).get("/v1/operating-core").expect(200),
      request(app).get("/v1/departments").expect(200),
      request(app).get("/v1/tasks").expect(200),
      request(app).get("/v1/events").expect(200),
      request(app).get("/v1/approvals").expect(200),
    ]);

    expect(responses[0]!.body.company.name).toBe("NovaCommerce");
    expect(snapshotReads).toBe(1);
    expect(responses[1]!.body.data).toHaveLength(8);
    expect(responses[2]!.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task_qualify_acme_lead" }),
      ]),
    );
    const serialized = JSON.stringify(responses.map(({ body }) => body));
    for (const forbidden of [
      "companyId",
      "singletonKey",
      "singleton_key",
      "databaseUrl",
      "password",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
