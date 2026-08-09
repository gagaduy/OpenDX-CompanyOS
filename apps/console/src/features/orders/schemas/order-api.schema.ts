// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const orderStatusSchema = z.enum(["pending_payment", "paid", "processing", "ready_for_fulfillment", "completed", "canceled", "expired"]);
const timestamp = z.iso.datetime();
const summary = z.object({
  id: z.uuid(), publicNumber: z.string(), customerId: z.uuid(), customerEmail: z.email(),
  status: orderStatusSchema, totalVnd: z.number().int().nonnegative(), currency: z.literal("VND"),
  createdAt: timestamp, updatedAt: timestamp,
});
const line = z.object({
  id: z.uuid(), variantId: z.uuid(), sku: z.string(), productTitle: z.string(), variantLabel: z.string(),
  quantity: z.number().int().positive(), unitPriceVnd: z.number().int().nonnegative(),
  discountAllocationVnd: z.number().int().nonnegative(), lineTotalVnd: z.number().int().nonnegative(),
  linePosition: z.number().int().nonnegative(),
});
const address = z.object({
  addressId: z.uuid(), recipientName: z.string(), phoneNumber: z.string(), addressLine: z.string(),
  ward: z.string(), provinceOrCity: z.string(), postalCode: z.string().optional(), deliveryNote: z.string().optional(),
  version: z.number().int().positive(),
});
const contact = z.object({ email: z.email(), fullName: z.string().optional(), phoneNumber: z.string().optional() });
const history = z.object({
  previousStatus: orderStatusSchema.optional(), newStatus: orderStatusSchema,
  actorType: z.enum(["customer", "staff", "system", "provider"]), reasonCode: z.string(), occurredAt: timestamp,
});

export const orderDetailSchema = summary.omit({ customerEmail: true }).extend({
  checkoutId: z.uuid(), addressSnapshot: address, contactSnapshot: contact,
  promotionCode: z.string().optional(), subtotalVnd: z.number().int().nonnegative(),
  discountVnd: z.number().int().nonnegative(), taxMode: z.literal("included_not_separated"),
  reservationExpiresAt: timestamp, paidAt: timestamp.optional(), completedAt: timestamp.optional(),
  version: z.number().int().positive(), lines: z.array(line), history: z.array(history),
});
export const orderListEnvelopeSchema = z.object({
  success: z.literal(true), message: z.string(),
  data: z.object({ items: z.array(summary), page: z.number().int().positive(), pageSize: z.number().int().positive(), totalItems: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }),
});
export const orderDetailEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: orderDetailSchema });
export const errorEnvelopeSchema = z.object({ success: z.literal(false), message: z.string(), errorCode: z.string() });
