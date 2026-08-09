// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { parseApiEnvironment } from "../../../../shared/config/environment";
import { createPostgresPool } from "../../../../shared/database/postgres";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { seedPromotions } from "./promotion.seed";

const environment = parseApiEnvironment(process.env);
const pool = createPostgresPool(environment);

try {
  await seedPromotions(new PostgresTransactionRunner(pool));
  console.info("NovaCommerce promotion seed completed.");
} finally {
  await pool.end();
}
