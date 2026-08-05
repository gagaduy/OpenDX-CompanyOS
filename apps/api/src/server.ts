// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { createApiApp } from "./app";
import { createCatalogModule } from "./modules/catalog";
import { FileTypeProductMediaInspector, MinioProductMediaStorage } from "./modules/catalog/infrastructure/storage/minio-product-media.storage";
import { PostgresqlCompanyOperatingCoreRepository } from "./modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository";
import { parseApiEnvironment } from "./shared/config/environment";
import { createPostgresPool } from "./shared/database/postgres";
import { PostgresTransactionRunner } from "./shared/database/transaction";
import { createRemoteStaffTokenVerifier } from "./shared/auth/staff-auth.middleware";

const environment = parseApiEnvironment(process.env);
const pool = createPostgresPool(environment);
const transactions = new PostgresTransactionRunner(pool);
const repository = new PostgresqlCompanyOperatingCoreRepository(transactions);
const minioEndpoint = new URL(environment.minioEndpoint);
const minio = new Client({
  endPoint: minioEndpoint.hostname,
  port: Number(minioEndpoint.port || (minioEndpoint.protocol === "https:" ? 443 : 80)),
  useSSL: minioEndpoint.protocol === "https:",
  accessKey: environment.minioAccessKey,
  secretKey: environment.minioSecretKey,
});
const catalogRouter = createCatalogModule({
  transactions,
  mediaStorage: new MinioProductMediaStorage(minio, environment.minioBucket),
  mediaInspector: new FileTypeProductMediaInspector(),
  staffTokenVerifier: createRemoteStaffTokenVerifier({
    issuer: environment.keycloakIssuer,
    audience: environment.keycloakAudience,
  }),
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  mediaMaximumBytes: environment.mediaMaxBytes,
});
const app = createApiApp({
  consoleOrigin: environment.consoleOrigin,
  companyOperatingCoreRepository: repository,
  catalogRouter,
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
