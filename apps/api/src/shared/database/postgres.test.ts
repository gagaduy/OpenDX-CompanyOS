// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createPostgresPool } from "./postgres";

describe("createPostgresPool", () => {
  it("uses the validated database URL and bounded defaults", async () => {
    const pool = createPostgresPool({
      databaseUrl: "postgres://opendx:secret@localhost:5432/opendx",
    });

    expect(pool.options.connectionString).toBe(
      "postgres://opendx:secret@localhost:5432/opendx",
    );
    expect(pool.options.max).toBe(10);
    await pool.end();
  });
});
