// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";

export interface PostgresPoolEnvironment {
  readonly databaseUrl: string;
}

export function createPostgresPool(
  environment: PostgresPoolEnvironment,
): Pool {
  return new Pool({
    connectionString: environment.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}
