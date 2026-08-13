// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const catalogMigrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);
const companyCoreMigrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../modules/company-operating-core/infrastructure/database/migrations",
);
const crmMigrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../modules/crm/infrastructure/database/migrations",
);
const supportMigrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../modules/support/infrastructure/database/migrations",
);
const agenticMigrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../modules/agentic/infrastructure/database/migrations",
);

export async function runCatalogMigrations(
  databaseUrl: string,
  direction: "up" | "down",
  count?: number,
): Promise<void> {
  await runner({
    databaseUrl,
    direction,
    count: direction === "down" && count === undefined
      ? Number.MAX_SAFE_INTEGER
      : count,
    dir: catalogMigrationsDirectory,
    ignorePattern: ".*\\.test\\.(ts|js)$",
    migrationsTable: "catalog_migrations",
    advisoryLockMode: "wait",
    checkOrder: true,
    singleTransaction: true,
    log: () => undefined,
  });
}

export async function runCompanyCoreMigrations(
  databaseUrl: string,
  direction: "up" | "down",
  count?: number,
): Promise<void> {
  await runner({
    databaseUrl,
    direction,
    count,
    dir: companyCoreMigrationsDirectory,
    migrationsTable: "company_core_migrations",
    advisoryLockMode: "wait",
    checkOrder: true,
    singleTransaction: true,
    log: () => undefined,
  });
}

export async function runCrmMigrations(
  databaseUrl: string,
  direction: "up" | "down",
  count?: number,
): Promise<void> {
  await runner({
    databaseUrl,
    direction,
    count,
    dir: crmMigrationsDirectory,
    migrationsTable: "crm_migrations",
    advisoryLockMode: "wait",
    checkOrder: true,
    singleTransaction: true,
    log: () => undefined,
  });
}

export async function runSupportMigrations(
  databaseUrl: string,
  direction: "up" | "down",
  count?: number,
): Promise<void> {
  await runner({ databaseUrl, direction, count, dir: supportMigrationsDirectory, migrationsTable: "support_migrations", advisoryLockMode: "wait", checkOrder: true, singleTransaction: true, log: () => undefined });
}

export async function runAgenticMigrations(
  databaseUrl: string,
  direction: "up" | "down",
  count?: number,
): Promise<void> {
  await runner({ databaseUrl, direction, count, dir: agenticMigrationsDirectory, migrationsTable: "agentic_migrations", advisoryLockMode: "wait", checkOrder: true, singleTransaction: true, log: () => undefined });
}
