// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProductMediaRepository } from "../../../application/repositories/interfaces/product-media.repository";
import type { ProductImageContentType, ProductMedia } from "../../../domain/entities/product-media";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

interface ProductMediaRow {
  id: string;
  product_id: string;
  object_key: string;
  content_type: string;
  byte_size: number;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
  created_at: Date | string;
}

const columns = `id, product_id, object_key, content_type, byte_size,
  alt_text, sort_order, is_primary, created_at`;

export class PostgresqlProductMediaRepository implements ProductMediaRepository {
  async listByProduct(
    session: DatabaseSession,
    productId: string,
  ): Promise<readonly ProductMedia[]> {
    const result = await session.query<ProductMediaRow>(
      `SELECT ${columns} FROM product_media
       WHERE product_id = $1 ORDER BY sort_order ASC, id ASC`,
      [productId],
    );
    return result.rows.map(mapRow);
  }

  async findById(session: DatabaseSession, id: string): Promise<ProductMedia | undefined> {
    const result = await session.query<ProductMediaRow>(
      `SELECT ${columns} FROM product_media WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapRow(result.rows[0]);
  }

  async create(session: DatabaseSession, media: ProductMedia): Promise<void> {
    if (media.isPrimary) await this.clearPrimary(session, media.productId);
    await session.query(
      `INSERT INTO product_media
        (id, product_id, object_key, content_type, byte_size, alt_text,
         sort_order, is_primary, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [media.id, media.productId, media.objectKey, media.contentType,
        media.byteSize, media.altText, media.sortOrder, media.isPrimary,
        media.createdAt],
    );
  }

  async update(session: DatabaseSession, media: ProductMedia): Promise<boolean> {
    if (media.isPrimary) await this.clearPrimary(session, media.productId);
    const result = await session.query(
      `UPDATE product_media SET alt_text = $3, sort_order = $4, is_primary = $5
       WHERE id = $1 AND product_id = $2`,
      [media.id, media.productId, media.altText, media.sortOrder, media.isPrimary],
    );
    return result.rowCount === 1;
  }

  async delete(session: DatabaseSession, id: string): Promise<boolean> {
    const result = await session.query("DELETE FROM product_media WHERE id = $1", [id]);
    return result.rowCount === 1;
  }

  private async clearPrimary(session: DatabaseSession, productId: string): Promise<void> {
    await session.query(
      "UPDATE product_media SET is_primary = false WHERE product_id = $1 AND is_primary = true",
      [productId],
    );
  }
}

function mapRow(row: ProductMediaRow): ProductMedia {
  return {
    id: row.id,
    productId: row.product_id,
    objectKey: row.object_key,
    contentType: contentType(row.content_type),
    byteSize: row.byte_size,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
    createdAt: (row.created_at instanceof Date ? row.created_at : new Date(row.created_at)).toISOString(),
  };
}

function contentType(value: string): ProductImageContentType {
  if (value !== "image/jpeg" && value !== "image/png" && value !== "image/webp" && value !== "image/avif") {
    throw new Error(`Invalid product media content type: ${value}`);
  }
  return value;
}
