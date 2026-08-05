// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VariantRepository } from "../../../application/repositories/interfaces/variant.repository";
import type { ProductPrice } from "../../../domain/entities/product-price";
import type { ProductVariant, VariantStatus } from "../../../domain/entities/product-variant";
import { assertVariantOptions } from "../../../domain/services/catalog-rules";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  option_values: unknown;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  version: number;
}

const columns = `id, product_id, sku, title, option_values, status,
  created_at, updated_at, version`;

export class PostgresqlVariantRepository implements VariantRepository {
  async findById(session: DatabaseSession, id: string): Promise<ProductVariant | undefined> {
    const result = await session.query<VariantRow>(
      `SELECT ${columns} FROM product_variants WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapVariant(result.rows[0]);
  }

  async findBySku(session: DatabaseSession, sku: string): Promise<ProductVariant | undefined> {
    const result = await session.query<VariantRow>(
      `SELECT ${columns} FROM product_variants WHERE lower(sku) = lower($1)`,
      [sku],
    );
    return result.rows[0] === undefined ? undefined : mapVariant(result.rows[0]);
  }

  async create(session: DatabaseSession, variant: ProductVariant): Promise<void> {
    await session.query(
      `INSERT INTO product_variants
        (id, product_id, sku, title, option_values, status,
         created_at, updated_at, version)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
      [variant.id, variant.productId, variant.sku, variant.title,
        JSON.stringify(variant.optionValues), variant.status,
        variant.createdAt, variant.updatedAt, variant.version],
    );
  }

  async update(
    session: DatabaseSession,
    variant: ProductVariant,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE product_variants SET
         sku = $2, title = $3, option_values = $4::jsonb,
         status = $5, updated_at = $6, version = $7
       WHERE id = $1 AND version = $8`,
      [variant.id, variant.sku, variant.title, JSON.stringify(variant.optionValues),
        variant.status, variant.updatedAt, variant.version, expectedVersion],
    );
    return result.rowCount === 1;
  }

  async replaceCurrentPrice(
    session: DatabaseSession,
    price: ProductPrice,
  ): Promise<void> {
    const locked = await session.query<{ id: string }>(
      "SELECT id FROM product_variants WHERE id = $1 FOR UPDATE",
      [price.variantId],
    );
    if (locked.rowCount !== 1) throw new Error("Variant not found while replacing price");
    await session.query(
      `UPDATE product_prices SET valid_to = $2
       WHERE variant_id = $1 AND valid_to IS NULL`,
      [price.variantId, price.validFrom],
    );
    await session.query(
      `INSERT INTO product_prices
        (id, variant_id, amount_minor, currency, tax_inclusive,
         valid_from, valid_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
      [price.id, price.variantId, price.amountMinor, price.currency,
        price.taxInclusive, price.validFrom, price.createdBy],
    );
  }
}

function mapVariant(row: VariantRow): ProductVariant {
  assertVariantOptions(row.option_values);
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    title: row.title,
    optionValues: structuredClone(row.option_values),
    status: variantStatus(row.status),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
  };
}

function variantStatus(value: string): VariantStatus {
  if (value !== "active" && value !== "archived") throw new Error(`Invalid variant status: ${value}`);
  return value;
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
