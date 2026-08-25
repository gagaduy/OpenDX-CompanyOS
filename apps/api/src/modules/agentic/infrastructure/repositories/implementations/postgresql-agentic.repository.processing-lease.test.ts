// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { PostgresqlAgenticRepository } from "./postgresql-agentic.repository";

describe("PostgresqlAgenticRepository processing lease", () => {
  it("claims uploaded and only stale scanning files with SKIP LOCKED", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "file-1" }] }));
    const ids = await new PostgresqlAgenticRepository().claimIntakeFilesForProcessing({ query } as never, "2026-08-22T00:10:00.000Z", 20);
    expect(ids).toEqual(["file-1"]);
    const sql = (query.mock.calls as unknown as readonly [string][])[0]?.[0] ?? "";
    expect(sql).toContain("processing_claimed_at < $1::timestamptz - interval '10 minutes'");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
  });
});
