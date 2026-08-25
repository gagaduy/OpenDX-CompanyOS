// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const attributeValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
export const categorySchema = z.object({
  id: z.uuid(), parentId: z.uuid().optional(), name: z.string(), slug: z.string(),
  description: z.string().optional(), sortOrder: z.number().int(), status: z.enum(["active", "archived"]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), version: z.number().int().positive(),
});
export const productSchema = z.object({
  id: z.uuid(), categoryId: z.uuid(), name: z.string(), slug: z.string(), brand: z.string().optional(),
  description: z.string(), attributes: z.record(z.string(), attributeValue), status: z.enum(["draft", "published", "archived"]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), version: z.number().int().positive(),
});
export const productListItemSchema = productSchema.pick({
  id: true, categoryId: true, name: true, slug: true, brand: true, status: true, updatedAt: true, version: true,
}).extend({
  categoryName: z.string(), primaryMediaId: z.uuid().optional(), variantCount: z.number().int().nonnegative(),
  minimumPrice: z.number().int().nonnegative().optional(), maximumPrice: z.number().int().nonnegative().optional(),
  availabilitySummary: z.object({ totalAvailable: z.number().int().nonnegative(), purchasableVariantCount: z.number().int().nonnegative() }),
});
export const categoriesEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.array(categorySchema) });
export const categoryEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: categorySchema });
export const productEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: productSchema });
export const productListEnvelopeSchema = z.object({
  success: z.literal(true), message: z.string(), data: z.array(productListItemSchema),
  meta: z.object({ page: z.number().int(), pageSize: z.number().int(), totalItems: z.number().int(), totalPages: z.number().int() }),
});
export const errorEnvelopeSchema = z.object({
  success: z.literal(false), message: z.string(), errorCode: z.string(), errors: z.array(z.unknown()).optional(),
});
export const variantSchema = z.object({
  id: z.uuid(), productId: z.uuid(), sku: z.string(), title: z.string(),
  optionValues: z.record(z.string(), z.string()), status: z.enum(["active", "archived"]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), version: z.number().int().positive(),
});
export const priceSchema = z.object({
  id: z.uuid(), variantId: z.uuid(), amountMinor: z.number().int().positive(), currency: z.literal("VND"),
  validFrom: z.iso.datetime(), validTo: z.iso.datetime().optional(), createdBy: z.string(),
});
export const mediaSchema = z.object({
  id: z.uuid(), productId: z.uuid(), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  byteSize: z.number().int().nonnegative(), altText: z.string(), sortOrder: z.number().int().nonnegative(),
  isPrimary: z.boolean(), previewUrl: z.string(), createdAt: z.iso.datetime(),
});
export const auditEntrySchema = z.object({
  id: z.uuid(), actorId: z.string(), action: z.string(), resourceType: z.enum(["category", "product", "variant", "price", "media"]),
  resourceId: z.uuid(), outcome: z.enum(["success", "failure", "denied"]), correlationId: z.string(),
  metadata: z.record(z.string(), z.unknown()), occurredAt: z.iso.datetime(),
});
export const variantEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: variantSchema });
export const priceEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: priceSchema });
export const mediaEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: mediaSchema });
export const auditEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.array(auditEntrySchema) });
export const publicationReadinessSchema = z.object({
  ready: z.boolean(),
  missing: z.array(z.enum(["ACTIVE_CATEGORY", "ACTIVE_VARIANT", "CURRENT_PRICE", "PRIMARY_IMAGE", "INVENTORY_ITEM"])),
});
export const publicationReadinessEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: publicationReadinessSchema });
