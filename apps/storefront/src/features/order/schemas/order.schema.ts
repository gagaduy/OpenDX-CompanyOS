// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const orderStatusSchema = z.enum([
  "pending_payment",
  "paid",
  "processing",
  "ready_for_fulfillment",
  "completed",
  "canceled",
  "expired",
]);

const orderSummarySchema = z.object({
  id: z.string(),
  publicNumber: z.string(),
  status: orderStatusSchema,
  totalVnd: z.number().int().nonnegative(),
  currency: z.literal("VND"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const orderLineSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  sku: z.string(),
  productTitle: z.string(),
  variantLabel: z.string(),
  quantity: z.number().int().positive(),
  unitPriceVnd: z.number().int().nonnegative(),
  discountAllocationVnd: z.number().int().nonnegative(),
  lineTotalVnd: z.number().int().nonnegative(),
  linePosition: z.number().int().nonnegative(),
});

export const orderDetailSchema = orderSummarySchema.extend({
  checkoutId: z.string(),
  addressSnapshot: z.record(z.string(), z.unknown()),
  contactSnapshot: z.record(z.string(), z.unknown()),
  promotionCode: z.string().optional(),
  subtotalVnd: z.number().int().nonnegative(),
  discountVnd: z.number().int().nonnegative(),
  taxMode: z.literal("included_not_separated"),
  reservationExpiresAt: z.string(),
  paidAt: z.string().optional(),
  version: z.number().int().positive(),
  lines: z.array(orderLineSchema),
  history: z.array(z.object({
    previousStatus: orderStatusSchema.optional(),
    newStatus: orderStatusSchema,
    actorType: z.enum(["customer", "staff", "system", "provider"]),
    reasonCode: z.string(),
    occurredAt: z.string(),
  })),
});

export const orderListEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    items: z.array(orderSummarySchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const orderDetailEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: orderDetailSchema,
});
