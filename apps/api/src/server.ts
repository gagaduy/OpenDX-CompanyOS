// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createApiApp } from "./app";
import { PostgresqlCompanyOperatingCoreRepository } from "./modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository";
import { parseApiEnvironment } from "./shared/config/environment";
import { createPostgresPool } from "./shared/database/postgres";
import { PostgresTransactionRunner } from "./shared/database/transaction";

const environment = parseApiEnvironment(process.env);
const pool = createPostgresPool(environment);
const repository = new PostgresqlCompanyOperatingCoreRepository(
  new PostgresTransactionRunner(pool),
);
const app = createApiApp({
  consoleOrigin: environment.consoleOrigin,
  companyOperatingCoreRepository: repository,
});

const server = app.listen(environment.apiPort, () => {
  console.log(`OpenDX API listening on http://localhost:${environment.apiPort}`);
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await pool.end();
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
