// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { parseApiEnvironment } from "../../../../shared/config/environment";
import { createPostgresPool } from "../../../../shared/database/postgres";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { seedNovaCommercePostgresql } from "./nova-commerce-postgresql.seed";

async function main(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  const pool = createPostgresPool(environment);
  try {
    await seedNovaCommercePostgresql(new PostgresTransactionRunner(pool));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
