// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";

export interface PostgresPoolEnvironment {
  readonly databaseUrl: string;
  readonly onBackgroundError?: (error: Error) => void;
}

export function createPostgresPool(
  environment: PostgresPoolEnvironment,
): Pool {
  const pool = new Pool({
    connectionString: environment.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (error) => {
    if (environment.onBackgroundError !== undefined) {
      environment.onBackgroundError(error);
      return;
    }
    console.error("PostgreSQL pool background error", error);
  });
  return pool;
}
