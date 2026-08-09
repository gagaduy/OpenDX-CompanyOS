// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const paymentStatusSchema = z.enum(["created", "pending_provider", "paid", "failed", "canceled", "expired"]);
const timestamp = z.iso.datetime();
const summary = z.object({
  id: z.uuid(), orderId: z.uuid(), status: paymentStatusSchema,
  expectedAmountVnd: z.number().int().nonnegative(), currency: z.literal("VND"),
  invoiceNumber: z.string(), providerOrderId: z.string().optional(), updatedAt: timestamp,
});
const event = z.object({
  id: z.uuid(), notificationType: z.string(), providerEventId: z.string().optional(), providerOrderId: z.string().optional(),
  providerTransactionId: z.string().optional(), amountVnd: z.number().int().nonnegative().optional(), currency: z.literal("VND").optional(),
  normalizedState: z.enum(["paid", "unsupported", "invalid"]),
  processingResult: z.enum(["received", "applied", "already_processed", "review_required", "rejected"]),
  failureReason: z.string().optional(), redactedPayload: z.record(z.string(), z.unknown()), correlationId: z.string(),
  receivedAt: timestamp, processedAt: timestamp.optional(),
});
const reconciliation = z.object({
  id: z.uuid(), triggerActorType: z.enum(["staff", "system"]), providerOrderId: z.string().optional(),
  internalStatus: paymentStatusSchema, providerStatus: z.string().optional(), internalAmountVnd: z.number().int().nonnegative(),
  providerAmountVnd: z.number().int().nonnegative().optional(), comparisonResult: z.enum(["matched_paid", "still_pending", "mismatch", "unsupported", "provider_error"]),
  redactedResponse: z.record(z.string(), z.unknown()).optional(), correlationId: z.string(), createdAt: timestamp,
});
export const paymentDetailSchema = summary.extend({ attemptId: z.uuid(), expiresAt: timestamp, events: z.array(event), reconciliations: z.array(reconciliation) });
export const paymentListEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.object({ items: z.array(summary), page: z.number().int().positive(), pageSize: z.number().int().positive(), totalItems: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }) });
export const paymentDetailEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: paymentDetailSchema });
export const errorEnvelopeSchema = z.object({ success: z.literal(false), message: z.string(), errorCode: z.string() });
