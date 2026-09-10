// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import type { StorefrontHeroActivation } from "../../../application/repositories/interfaces/storefront-hero.repository";
import { PostgresqlStorefrontHeroRepository } from "./postgresql-storefront-hero.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  presentation: "90000000-0000-4000-8000-000000000001",
  replay: "90000000-0000-4000-8000-000000000002",
  laptops: "91000000-0000-4000-8000-000000000001",
  phones: "91000000-0000-4000-8000-000000000002",
  archived: "91000000-0000-4000-8000-000000000003",
} as const;
const digest = "a".repeat(64);

function activation(overrides: Partial<StorefrontHeroActivation> = {}): StorefrontHeroActivation {
  return {
    id: ids.presentation,
    code: "nova-signal",
    objectKey: `storefront/hero/${digest}.mp4`,
    contentDigest: digest,
    contentType: "video/mp4",
    byteSize: 100,
    durationMs: 24_000,
    chapters: [
      { categorySlug: "laptops", sortOrder: 0, startMs: 0, endMs: 12_000, label: "Laptop" },
      { categorySlug: "phones", sortOrder: 1, startMs: 12_000, endMs: 24_000, label: "Phone" },
    ],
    ...overrides,
  };
}

describeWithDatabase("PostgresqlStorefrontHeroRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlStorefrontHeroRepository();

  beforeAll(async () => runCatalogMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await pool.query("TRUNCATE storefront_hero_presentations, categories CASCADE");
    await pool.query(
      `INSERT INTO categories
        (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES
        ($1, 'Laptops', 'laptops', 0, 'active', NOW(), NOW(), 1),
        ($2, 'Phones', 'phones', 1, 'active', NOW(), NOW(), 1),
        ($3, 'Archived', 'archived', 2, 'archived', NOW(), NOW(), 1)`,
      [ids.laptops, ids.phones, ids.archived],
    );
  });
  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("activates a presentation only after replacing its complete ordered chapter set", async () => {
    await transactions.run((session) => repository.activate(session, activation()));

    const presentations = await pool.query(
      `SELECT id, code, content_digest, enabled FROM storefront_hero_presentations`,
    );
    expect(presentations.rows).toEqual([
      { id: ids.presentation, code: "nova-signal", content_digest: digest, enabled: true },
    ]);
    const chapters = await pool.query(
      `SELECT category_id, sort_order, start_ms, end_ms, label
       FROM storefront_hero_chapters ORDER BY sort_order`,
    );
    expect(chapters.rows).toEqual([
      { category_id: ids.laptops, sort_order: 0, start_ms: 0, end_ms: 12_000, label: "Laptop" },
      { category_id: ids.phones, sort_order: 1, start_ms: 12_000, end_ms: 24_000, label: "Phone" },
    ]);
  });

  it("converges an identical digest replay to one presentation and one chapter set", async () => {
    await transactions.run((session) => repository.activate(session, activation()));
    const persistedId = await transactions.run((session) =>
      repository.activate(
        session,
        activation({
          id: ids.replay,
          chapters: [
            { categorySlug: "laptops", sortOrder: 0, startMs: 0, endMs: 10_000, label: "Notebook" },
            { categorySlug: "phones", sortOrder: 1, startMs: 10_000, endMs: 24_000, label: "Mobile" },
          ],
        }),
      ),
    );

    expect(persistedId).toBe(ids.presentation);
    await expect(pool.query("SELECT count(*)::int AS count FROM storefront_hero_presentations"))
      .resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query("SELECT count(*)::int AS count FROM storefront_hero_chapters"))
      .resolves.toMatchObject({ rows: [{ count: 2 }] });
    await expect(pool.query("SELECT id, enabled FROM storefront_hero_presentations"))
      .resolves.toMatchObject({ rows: [{ id: ids.presentation, enabled: true }] });
  });

  it("replaces a stable code with a new digest without creating another logical presentation", async () => {
    await transactions.run((session) => repository.activate(session, activation()));
    const nextDigest = "c".repeat(64);

    const persistedId = await transactions.run((session) =>
      repository.activate(
        session,
        activation({
          id: ids.replay,
          objectKey: `storefront/hero/${nextDigest}.mp4`,
          contentDigest: nextDigest,
          byteSize: 200,
          chapters: [
            { categorySlug: "phones", sortOrder: 0, startMs: 0, endMs: 24_000, label: "Mobile" },
          ],
        }),
      ),
    );

    expect(persistedId).toBe(ids.presentation);
    await expect(
      pool.query(
        `SELECT id, code, content_digest, object_key, enabled
         FROM storefront_hero_presentations`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          id: ids.presentation,
          code: "nova-signal",
          content_digest: nextDigest,
          object_key: `storefront/hero/${nextDigest}.mp4`,
          enabled: true,
        },
      ],
    });
    await expect(
      pool.query(
        `SELECT count(*)::int AS count, min(label) AS label
         FROM storefront_hero_chapters`,
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1, label: "Mobile" }] });
  });

  it("converges a digest replay when its presentation code is renamed", async () => {
    await transactions.run((session) => repository.activate(session, activation()));

    const persistedId = await transactions.run((session) =>
      repository.activate(
        session,
        activation({ id: ids.replay, code: "nova-signal-renamed" }),
      ),
    );

    expect(persistedId).toBe(ids.presentation);
    await expect(
      pool.query(`SELECT id, code, content_digest, enabled FROM storefront_hero_presentations`),
    ).resolves.toMatchObject({
      rows: [
        {
          id: ids.presentation,
          code: "nova-signal-renamed",
          content_digest: digest,
          enabled: true,
        },
      ],
    });
  });

  it.each(["missing", "archived"])(
    "rejects the %s category and rolls the activation back",
    async (categorySlug) => {
      await expect(
        transactions.run((session) =>
          repository.activate(session, {
            ...activation(),
            chapters: [
              { categorySlug, sortOrder: 0, startMs: 0, endMs: 24_000, label: "Unavailable" },
            ],
          }),
        ),
      ).rejects.toThrow(`Unknown or inactive hero categories: ${categorySlug}`);

      await expect(pool.query("SELECT count(*)::int AS count FROM storefront_hero_presentations"))
        .resolves.toMatchObject({ rows: [{ count: 0 }] });
    },
  );

  it("disables only a currently enabled matching presentation", async () => {
    await transactions.run((session) => repository.activate(session, activation()));

    await expect(
      transactions.run((session) => repository.disable(session, "nova-signal")),
    ).resolves.toBe(true);
    await expect(
      transactions.run((session) => repository.disable(session, "nova-signal")),
    ).resolves.toBe(false);
    await expect(
      transactions.run((session) => repository.disable(session, "unknown")),
    ).resolves.toBe(false);
  });
});
