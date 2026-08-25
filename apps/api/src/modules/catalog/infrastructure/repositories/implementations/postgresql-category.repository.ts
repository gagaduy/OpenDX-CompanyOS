// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CategoryRepository } from "../../../application/repositories/interfaces/category.repository";
import type { Category, CategoryStatus } from "../../../domain/entities/category";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  version: number;
}

const selectColumns = `id, parent_id, name, slug, description, sort_order,
  status, created_at, updated_at, version`;

export class PostgresqlCategoryRepository implements CategoryRepository {
  async list(session: DatabaseSession): Promise<readonly Category[]> {
    const result = await session.query<CategoryRow>(
      `WITH RECURSIVE category_tree AS (
         SELECT ${selectColumns},
                lpad(sort_order::text, 10, '0') || ':' || slug || ':' || id AS tree_path
         FROM categories WHERE parent_id IS NULL
         UNION ALL
         SELECT child.id, child.parent_id, child.name, child.slug,
                child.description, child.sort_order, child.status,
                child.created_at, child.updated_at, child.version,
                parent.tree_path || '/' || lpad(child.sort_order::text, 10, '0') || ':' || child.slug || ':' || child.id
         FROM categories child
         JOIN category_tree parent ON parent.id = child.parent_id
       )
       SELECT ${selectColumns} FROM category_tree ORDER BY tree_path`,
    );
    return result.rows.map(mapCategoryRow);
  }

  async findById(
    session: DatabaseSession,
    id: string,
  ): Promise<Category | undefined> {
    const result = await session.query<CategoryRow>(
      `SELECT ${selectColumns} FROM categories WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapCategoryRow(result.rows[0]);
  }

  async findBySlug(
    session: DatabaseSession,
    slug: string,
  ): Promise<Category | undefined> {
    const result = await session.query<CategoryRow>(
      `SELECT ${selectColumns} FROM categories WHERE lower(slug) = lower($1)`,
      [slug],
    );
    return result.rows[0] === undefined ? undefined : mapCategoryRow(result.rows[0]);
  }

  async create(session: DatabaseSession, category: Category): Promise<void> {
    await session.query(
      `INSERT INTO categories
        (id, parent_id, name, slug, description, sort_order, status,
         created_at, updated_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [category.id, category.parentId ?? null, category.name, category.slug,
        category.description ?? null, category.sortOrder, category.status,
        category.createdAt, category.updatedAt, category.version],
    );
  }

  async update(
    session: DatabaseSession,
    category: Category,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE categories SET
         parent_id = $2, name = $3, slug = $4, description = $5,
         sort_order = $6, status = $7, updated_at = $8, version = $9
       WHERE id = $1 AND version = $10`,
      [category.id, category.parentId ?? null, category.name, category.slug,
        category.description ?? null, category.sortOrder, category.status,
        category.updatedAt, category.version, expectedVersion],
    );
    return result.rowCount === 1;
  }

  async wouldCreateCycle(
    session: DatabaseSession,
    categoryId: string,
    parentId: string,
  ): Promise<boolean> {
    const result = await session.query<{ cycle: boolean }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM categories WHERE id = $2
         UNION ALL
         SELECT parent.id, parent.parent_id
         FROM categories parent
         JOIN ancestors child ON parent.id = child.parent_id
       )
       SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = $1) AS cycle`,
      [categoryId, parentId],
    );
    return result.rows[0]?.cycle ?? false;
  }

  async hasActiveProducts(
    session: DatabaseSession,
    categoryId: string,
  ): Promise<boolean> {
    const result = await session.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM products WHERE category_id = $1 AND status = 'draft'
       ) AS exists`,
      [categoryId],
    );
    return result.rows[0]?.exists ?? false;
  }
}

function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    ...(row.parent_id === null ? {} : { parentId: row.parent_id }),
    name: row.name,
    slug: row.slug,
    ...(row.description === null ? {} : { description: row.description }),
    sortOrder: row.sort_order,
    status: categoryStatus(row.status),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
  };
}

function categoryStatus(value: string): CategoryStatus {
  if (value !== "active" && value !== "archived") {
    throw new Error(`Invalid category status: ${value}`);
  }
  return value;
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
