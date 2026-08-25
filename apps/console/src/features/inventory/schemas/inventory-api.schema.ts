// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const inventoryItemSchema = z.object({
  id: z.uuid(), variantId: z.uuid(), sku: z.string(), productId: z.uuid().optional(),
  productName: z.string().optional(), variantTitle: z.string().optional(),
  categoryId: z.uuid().optional(), categoryName: z.string().optional(), primaryMediaId: z.uuid().optional(),
  onHand: z.number().int().nonnegative(), reserved: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(), stockStatus: z.enum(["healthy", "low", "out_of_stock"]),
  version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const movementSchema = z.object({
  id: z.uuid(), inventoryItemId: z.uuid(), reservationId: z.uuid().optional(),
  movementType: z.enum(["receive", "adjustment", "reservation", "release", "expiry", "consume"]),
  onHandDelta: z.number().int(), reservedDelta: z.number().int(), reasonCode: z.string(), reasonNote: z.string().optional(),
  actorType: z.enum(["staff", "system"]), actorId: z.string(), correlationId: z.string(),
  idempotencyKey: z.string().optional(), occurredAt: z.iso.datetime(),
});
const metaSchema = z.object({ page: z.number().int(), pageSize: z.number().int(), totalItems: z.number().int(), totalPages: z.number().int() });
export const inventoryItemEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: inventoryItemSchema });
export const inventoryListEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.array(inventoryItemSchema), meta: metaSchema });
export const movementListEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.array(movementSchema), meta: metaSchema });
export const inventoryErrorEnvelopeSchema = z.object({ success: z.literal(false), message: z.string(), errorCode: z.string(), errors: z.array(z.unknown()).optional() });
