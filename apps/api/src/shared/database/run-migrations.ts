// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function runCatalogMigrations(
  databaseUrl: string,
  direction: "up" | "down",
  count?: number,
): Promise<void> {
  await runner({
    databaseUrl,
    direction,
    count,
    dir: migrationsDirectory,
    ignorePattern: ".*\\.test\\.(ts|js)$",
    migrationsTable: "catalog_migrations",
    checkOrder: true,
    singleTransaction: true,
    log: () => undefined,
  });
}
