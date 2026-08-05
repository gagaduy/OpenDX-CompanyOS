// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { createApiApp } from "./app";
import { createCatalogModule, createCatalogVariantReader } from "./modules/catalog";
import { createInventoryModule } from "./modules/inventory";
import { FileTypeProductMediaInspector, MinioProductMediaStorage } from "./modules/catalog/infrastructure/storage/minio-product-media.storage";
import { PostgresqlCompanyOperatingCoreRepository } from "./modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository";
import { parseApiEnvironment } from "./shared/config/environment";
import { createPostgresPool } from "./shared/database/postgres";
import { PostgresTransactionRunner } from "./shared/database/transaction";
import { createRemoteStaffTokenVerifier } from "./shared/auth/staff-auth.middleware";
import type { DependencyStatus } from "./shared/http/health.routes";

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
const staffTokenVerifier = createRemoteStaffTokenVerifier({
  issuer: environment.keycloakIssuer,
  jwksUrl: environment.keycloakJwksUrl,
  audience: environment.keycloakAudience,
});
const inventory = createInventoryModule({
  transactions,
  variantReader: createCatalogVariantReader(),
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  reservationTtlMs: environment.inventoryReservationTtlSeconds * 1_000,
  expiryIntervalMs: environment.inventoryExpiryIntervalSeconds * 1_000,
  onWorkerError: (error) => console.error("Inventory expiry worker failed", error),
});
const catalog = createCatalogModule({
  transactions,
  mediaStorage: new MinioProductMediaStorage(minio, environment.minioBucket),
  mediaInspector: new FileTypeProductMediaInspector(),
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  mediaMaximumBytes: environment.mediaMaxBytes,
  availability: inventory.availability,
});
const app = createApiApp({
  consoleOrigin: environment.consoleOrigin,
  companyOperatingCoreRepository: repository,
  catalogAdminRouter: catalog.adminRouter,
  storefrontRouter: catalog.publicRouter,
  inventoryRouter: inventory.router,
  readiness: async () => ({
    postgres: await probe(async () => { await pool.query("SELECT 1"); }),
    migrations: await probe(async () => {
      const result = await pool.query<{ catalog: string; company_core: string; inventory: string }>(
        "SELECT (SELECT count(*)::text FROM catalog_migrations) AS catalog, (SELECT count(*)::text FROM company_core_migrations) AS company_core, (SELECT count(*)::text FROM inventory_migrations) AS inventory",
      );
      if (Number(result.rows[0]?.catalog ?? 0) < 2 || Number(result.rows[0]?.company_core ?? 0) < 1 || Number(result.rows[0]?.inventory ?? 0) < 1) {
        throw new Error("Database migrations are incomplete");
      }
    }),
    keycloak: await probe(async () => {
      const response = await fetch(environment.keycloakJwksUrl);
      if (!response.ok) throw new Error("Keycloak JWKS is unavailable");
    }),
    minio: await probe(async () => {
      if (!(await minio.bucketExists(environment.minioBucket))) {
        throw new Error("Product media bucket is unavailable");
      }
    }),
  }),
});

const server = app.listen(environment.apiPort, () => {
  console.log(`OpenDX API listening on http://localhost:${environment.apiPort}`);
  inventory.expiryWorker.start();
});

async function shutdown(): Promise<void> {
  inventory.expiryWorker.stop();
  server.close(async () => {
    await pool.end();
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

async function probe(operation: () => Promise<void>): Promise<DependencyStatus> {
  try {
    await operation();
    return "up";
  } catch {
    return "down";
  }
}
