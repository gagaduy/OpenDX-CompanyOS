// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { PostgresTransactionRunner } from "./transaction";

function createPool() {
  const calls: string[] = [];
  const release = vi.fn();
  const client = {
    async query(text: string) {
      calls.push(text);
      return { rows: [], rowCount: 0 };
    },
    release,
  };
  return {
    calls,
    release,
    pool: { connect: vi.fn(async () => client) },
  };
}

describe("PostgresTransactionRunner", () => {
  it("commits successful work and releases the client", async () => {
    const fixture = createPool();
    const runner = new PostgresTransactionRunner(fixture.pool);

    const result = await runner.run(async (session) => {
      await session.query("SELECT 1");
      return "complete";
    });

    expect(result).toBe("complete");
    expect(fixture.calls).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it("rolls back failed work and releases the client", async () => {
    const fixture = createPool();
    const runner = new PostgresTransactionRunner(fixture.pool);

    await expect(
      runner.run(async () => {
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");

    expect(fixture.calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(fixture.release).toHaveBeenCalledOnce();
  });
});
