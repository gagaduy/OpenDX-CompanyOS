// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function runInventoryMigrations(
  databaseUrl: string,
  direction: "up" | "down",
  count?: number,
): Promise<void> {
  await runner({
    databaseUrl,
    direction,
    count,
    dir: migrationsDirectory,
    migrationsTable: "inventory_migrations",
    advisoryLockMode: "wait",
    checkOrder: true,
    singleTransaction: true,
    log: () => undefined,
  });
}
