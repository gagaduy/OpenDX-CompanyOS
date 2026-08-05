// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface DatabaseQueryResult<Row extends object> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}

export interface DatabaseSession {
  query<Row extends object>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>>;
}

interface PostgresClientLike {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: readonly Record<string, unknown>[]; rowCount: number | null }>;
  release(): void;
}

interface PostgresPoolLike {
  connect(): Promise<PostgresClientLike>;
}

export interface TransactionRunner {
  run<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T>;
  runReadOnly<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T>;
}

export class PostgresTransactionRunner implements TransactionRunner {
  constructor(private readonly pool: PostgresPoolLike) {}

  async run<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return this.execute("BEGIN", work);
  }

  async runReadOnly<T>(
    work: (session: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    return this.execute("BEGIN READ ONLY", work);
  }

  private async execute<T>(
    beginStatement: "BEGIN" | "BEGIN READ ONLY",
    work: (session: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const session: DatabaseSession = {
      async query<Row extends object>(
        text: string,
        values?: readonly unknown[],
      ): Promise<DatabaseQueryResult<Row>> {
        const result = await client.query(text, values);
        return {
          rows: result.rows as readonly Row[],
          rowCount: result.rowCount ?? 0,
        };
      },
    };

    try {
      await client.query(beginStatement);
      const result = await work(session);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
