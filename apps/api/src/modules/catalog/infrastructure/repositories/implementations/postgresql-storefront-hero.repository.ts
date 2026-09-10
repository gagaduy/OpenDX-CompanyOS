// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  StorefrontHeroActivation,
  StorefrontHeroRepository,
} from "../../../application/repositories/interfaces/storefront-hero.repository";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

interface CategoryRow {
  readonly id: string;
  readonly slug: string;
  readonly status: string;
}

export class PostgresqlStorefrontHeroRepository implements StorefrontHeroRepository {
  async acquireImportLock(session: DatabaseSession): Promise<void> {
    await session.query("SELECT pg_advisory_xact_lock(hashtext('catalog.storefront-hero'))");
  }

  async activate(session: DatabaseSession, input: StorefrontHeroActivation): Promise<string> {
    await this.acquireImportLock(session);

    const categorySlugs = input.chapters.map(({ categorySlug }) => categorySlug);
    const categoryResult = await session.query<CategoryRow>(
      `SELECT id, slug, status FROM categories WHERE slug = ANY($1::text[])`,
      [categorySlugs],
    );
    const categoriesBySlug = new Map(categoryResult.rows.map((category) => [category.slug, category]));
    const unavailableSlugs = categorySlugs.filter((slug) => {
      const category = categoriesBySlug.get(slug);
      return category === undefined || category.status !== "active";
    });
    if (unavailableSlugs.length > 0) {
      throw new Error(`Unknown or inactive hero categories: ${unavailableSlugs.join(", ")}`);
    }

    await session.query(`UPDATE storefront_hero_presentations SET enabled = FALSE WHERE enabled = TRUE`);
    const existingResult = await session.query<{
      id: string;
      matches_code: boolean;
      matches_digest: boolean;
    }>(
      `SELECT id, code = $1 AS matches_code, content_digest = $2 AS matches_digest
       FROM storefront_hero_presentations
       WHERE code = $1 OR content_digest = $2
       FOR UPDATE`,
      [input.code, input.contentDigest],
    );
    const codeMatch = existingResult.rows.find(({ matches_code }) => matches_code);
    const digestMatch = existingResult.rows.find(({ matches_digest }) => matches_digest);
    const presentationId = codeMatch?.id ?? digestMatch?.id ?? input.id;

    if (codeMatch !== undefined && digestMatch !== undefined && codeMatch.id !== digestMatch.id) {
      await session.query(`DELETE FROM storefront_hero_presentations WHERE id = $1`, [
        digestMatch.id,
      ]);
    }

    if (codeMatch !== undefined || digestMatch !== undefined) {
      await session.query(
        `UPDATE storefront_hero_presentations SET
           code = $2,
           object_key = $3,
           content_type = $4,
           byte_size = $5,
           duration_ms = $6,
           content_digest = $7,
           updated_at = NOW(),
           enabled = FALSE
         WHERE id = $1`,
        [
          presentationId,
          input.code,
          input.objectKey,
          input.contentType,
          input.byteSize,
          input.durationMs,
          input.contentDigest,
        ],
      );
    } else {
      await session.query(
        `INSERT INTO storefront_hero_presentations
          (id, code, object_key, content_type, byte_size, duration_ms, content_digest, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
        [
          input.id,
          input.code,
          input.objectKey,
          input.contentType,
          input.byteSize,
          input.durationMs,
          input.contentDigest,
        ],
      );
    }

    await session.query(`DELETE FROM storefront_hero_chapters WHERE presentation_id = $1`, [
      presentationId,
    ]);
    const values: unknown[] = [];
    const tuples = input.chapters.map((chapter, index) => {
      const categoryId = categoriesBySlug.get(chapter.categorySlug)!.id;
      const offset = index * 6;
      values.push(
        presentationId,
        categoryId,
        chapter.sortOrder,
        chapter.startMs,
        chapter.endMs,
        chapter.label,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    });
    await session.query(
      `INSERT INTO storefront_hero_chapters
        (presentation_id, category_id, sort_order, start_ms, end_ms, label)
       VALUES ${tuples.join(", ")}`,
      values,
    );
    await session.query(
      `UPDATE storefront_hero_presentations SET enabled = TRUE, updated_at = NOW() WHERE id = $1`,
      [presentationId],
    );
    return presentationId;
  }

  async disable(session: DatabaseSession, code: string): Promise<boolean> {
    await this.acquireImportLock(session);
    const result = await session.query(
      `UPDATE storefront_hero_presentations
       SET enabled = FALSE, updated_at = NOW()
       WHERE code = $1 AND enabled = TRUE`,
      [code],
    );
    return result.rowCount === 1;
  }

  async isObjectReferenced(session: DatabaseSession, objectKey: string): Promise<boolean> {
    const result = await session.query<{ referenced: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM storefront_hero_presentations WHERE object_key = $1
       ) AS referenced`,
      [objectKey],
    );
    return result.rows[0]?.referenced ?? false;
  }
}
