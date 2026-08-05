// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Category } from "../../../domain/entities/category";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { PostgresqlCategoryRepository } from "./postgresql-category.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const timestamp = "2026-08-05T00:00:00.000Z";
const ids = {
  root: "00000000-0000-4000-8000-000000000001",
  child: "00000000-0000-4000-8000-000000000002",
  other: "00000000-0000-4000-8000-000000000003",
  first: "00000000-0000-4000-8000-000000000004",
  second: "00000000-0000-4000-8000-000000000005",
  rollback: "00000000-0000-4000-8000-000000000006",
} as const;

function category(id: string, slug: string, parentId?: string): Category {
  return {
    id,
    ...(parentId === undefined ? {} : { parentId }),
    name: id,
    slug,
    sortOrder: id === ids.child ? 1 : 0,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  };
}

describeWithDatabase("PostgresqlCategoryRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlCategoryRepository();

  beforeAll(async () => runCatalogMigrations(databaseUrl!, "up"));
  beforeEach(async () => pool.query("TRUNCATE categories CASCADE"));
  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("maps rows and orders parents before their children", async () => {
    await transactions.run(async (session) => {
      await repository.create(session, category(ids.root, "root"));
      await repository.create(
        session,
        category(ids.child, "child", ids.root),
      );
      await repository.create(session, category(ids.other, "other"));
    });

    const listed = await transactions.runReadOnly((session) =>
      repository.list(session),
    );
    expect(listed.map(({ id }) => id)).toEqual([
      ids.other,
      ids.root,
      ids.child,
    ]);
    expect(listed[0]).not.toHaveProperty("parentId");
  });

  it("enforces case-insensitive slug uniqueness", async () => {
    await transactions.run((session) =>
      repository.create(session, category(ids.first, "Home")),
    );
    await expect(
      transactions.run((session) =>
        repository.create(session, category(ids.second, "home")),
      ),
    ).rejects.toMatchObject({ code: "23505" });

    const found = await transactions.runReadOnly((session) =>
      repository.findBySlug(session, "HOME"),
    );
    expect(found?.id).toBe(ids.first);
  });

  it("updates only the expected version and detects hierarchy cycles", async () => {
    const root = category(ids.root, "root");
    const child = category(ids.child, "child", root.id);
    await transactions.run(async (session) => {
      await repository.create(session, root);
      await repository.create(session, child);
    });

    await transactions.run(async (session) => {
      expect(await repository.wouldCreateCycle(session, root.id, child.id)).toBe(true);
      expect(
        await repository.update(
          session,
          { ...root, name: "Updated", version: 2 },
          1,
        ),
      ).toBe(true);
      expect(
        await repository.update(
          session,
          { ...root, name: "Stale", version: 2 },
          1,
        ),
      ).toBe(false);
    });
    expect(
      await transactions.runReadOnly((session) => repository.findById(session, root.id)),
    ).toMatchObject({ name: "Updated", version: 2 });
  });

  it("participates in caller rollback", async () => {
    await expect(
      transactions.run(async (session) => {
        await repository.create(session, category(ids.rollback, "rollback"));
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(
      await transactions.runReadOnly((session) =>
        repository.findById(session, ids.rollback),
      ),
    ).toBeUndefined();
  });
});
