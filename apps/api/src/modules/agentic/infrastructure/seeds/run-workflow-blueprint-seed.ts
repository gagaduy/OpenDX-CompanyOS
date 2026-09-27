// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createPostgresPool } from "../../../../shared/database/postgres";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { seedWorkflowBlueprints } from "./workflow-blueprint.seed";

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgres://opendx_local:opendx_local_password@localhost:55432/opendx";

const pool = createPostgresPool({ databaseUrl });

try {
  await seedWorkflowBlueprints(new PostgresTransactionRunner(pool));
  console.info("NovaCommerce enterprise workflow blueprints seed completed.");
} finally {
  await pool.end();
}
