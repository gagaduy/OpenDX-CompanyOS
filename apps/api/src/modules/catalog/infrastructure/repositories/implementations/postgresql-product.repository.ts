// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductListQuery } from "../../../application/dtos/requests/product-request.dto";
import type { ProductListItemDto } from "../../../application/dtos/responses/product-response.dto";
import type {
  ProductListResult,
  ProductRepository,
} from "../../../application/repositories/interfaces/product.repository";
import type { Product, ProductStatus } from "../../../domain/entities/product";
import { assertAttributes } from "../../../domain/services/catalog-rules";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

interface ProductRow {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string;
  attributes: unknown;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  version: number;
}

interface ProductListRow extends ProductRow {
  category_name: string;
  primary_media_id: string | null;
  variant_count: number;
  minimum_price: string | null;
  maximum_price: string | null;
}

const productColumns = `p.id, p.category_id, p.name, p.slug, p.brand,
  p.description, p.attributes, p.status, p.created_at, p.updated_at, p.version`;

export class PostgresqlProductRepository implements ProductRepository {
  async list(
    session: DatabaseSession,
    query: ProductListQuery,
  ): Promise<ProductListResult> {
    const values: unknown[] = [];
    const where: string[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.query !== undefined && query.query.trim().length > 0) {
      const parameter = bind(`%${query.query.trim()}%`);
      where.push(`(p.name ILIKE ${parameter} OR EXISTS (
        SELECT 1 FROM product_variants search_variant
        WHERE search_variant.product_id = p.id AND search_variant.sku ILIKE ${parameter}
      ))`);
    }
    if (query.categoryId !== undefined) {
      where.push(`p.category_id = ${bind(query.categoryId)}`);
    }
    if (query.status !== undefined) {
      where.push(`p.status = ${bind(query.status)}`);
    }
    const whereSql = where.length === 0 ? "" : `WHERE ${where.join(" AND ")}`;
    const count = await session.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM products p ${whereSql}`,
      values,
    );
    const limit = bind(query.pageSize);
    const offset = bind((query.page - 1) * query.pageSize);
    const result = await session.query<ProductListRow>(
      `SELECT ${productColumns}, category.name AS category_name,
              (SELECT media.id FROM product_media media
               WHERE media.product_id = p.id AND media.is_primary = true
               LIMIT 1) AS primary_media_id,
              (SELECT count(*)::int FROM product_variants variant
               WHERE variant.product_id = p.id) AS variant_count,
              (SELECT min(price.amount_minor)::text
               FROM product_prices price
               JOIN product_variants variant ON variant.id = price.variant_id
               WHERE variant.product_id = p.id AND price.valid_to IS NULL) AS minimum_price,
              (SELECT max(price.amount_minor)::text
               FROM product_prices price
               JOIN product_variants variant ON variant.id = price.variant_id
               WHERE variant.product_id = p.id AND price.valid_to IS NULL) AS maximum_price
       FROM products p
       JOIN categories category ON category.id = p.category_id
       ${whereSql}
       ORDER BY p.updated_at DESC, p.id ASC
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      items: result.rows.map(mapListRow),
      totalItems: Number(count.rows[0]?.total ?? 0),
    };
  }

  async findById(session: DatabaseSession, id: string): Promise<Product | undefined> {
    const result = await session.query<ProductRow>(
      `SELECT ${productColumns} FROM products p WHERE p.id = $1`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapProductRow(result.rows[0]);
  }

  async findBySlug(session: DatabaseSession, slug: string): Promise<Product | undefined> {
    const result = await session.query<ProductRow>(
      `SELECT ${productColumns} FROM products p WHERE lower(p.slug) = lower($1)`,
      [slug],
    );
    return result.rows[0] === undefined ? undefined : mapProductRow(result.rows[0]);
  }

  async create(session: DatabaseSession, product: Product): Promise<void> {
    await session.query(
      `INSERT INTO products
        (id, category_id, name, slug, brand, description, attributes,
         status, created_at, updated_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
      [product.id, product.categoryId, product.name, product.slug,
        product.brand ?? null, product.description, JSON.stringify(product.attributes),
        product.status, product.createdAt, product.updatedAt, product.version],
    );
  }

  async update(
    session: DatabaseSession,
    product: Product,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE products SET
         category_id = $2, name = $3, slug = $4, brand = $5,
         description = $6, attributes = $7::jsonb, status = $8,
         updated_at = $9, version = $10
       WHERE id = $1 AND version = $11`,
      [product.id, product.categoryId, product.name, product.slug,
        product.brand ?? null, product.description, JSON.stringify(product.attributes),
        product.status, product.updatedAt, product.version, expectedVersion],
    );
    return result.rowCount === 1;
  }
}

function mapProductRow(row: ProductRow): Product {
  assertAttributes(row.attributes);
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    slug: row.slug,
    ...(row.brand === null ? {} : { brand: row.brand }),
    description: row.description,
    attributes: structuredClone(row.attributes),
    status: productStatus(row.status),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
  };
}

function mapListRow(row: ProductListRow): ProductListItemDto {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
    slug: row.slug,
    ...(row.brand === null ? {} : { brand: row.brand }),
    status: productStatus(row.status),
    ...(row.primary_media_id === null ? {} : { primaryMediaId: row.primary_media_id }),
    variantCount: row.variant_count,
    ...(row.minimum_price === null ? {} : { minimumPrice: safeInteger(row.minimum_price) }),
    ...(row.maximum_price === null ? {} : { maximumPrice: safeInteger(row.maximum_price) }),
    updatedAt: toIso(row.updated_at),
    version: row.version,
  };
}

function productStatus(value: string): ProductStatus {
  if (value !== "draft" && value !== "archived") throw new Error(`Invalid product status: ${value}`);
  return value;
}

function safeInteger(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Product price exceeds safe integer range");
  return number;
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
