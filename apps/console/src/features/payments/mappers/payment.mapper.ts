// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { paymentDetailSchema, paymentListEnvelopeSchema } from "../schemas/payment-api.schema";
import type { EvidenceAttention, PaymentDetailView, PaymentPageView, PaymentStatus, PaymentSummaryView } from "../types/payment.types";

const statusLabels: Record<PaymentStatus, string> = { created: "Created", pending_provider: "Pending provider", paid: "Paid", failed: "Failed", canceled: "Canceled", expired: "Expired" };
const statusAttention: Record<PaymentStatus, EvidenceAttention> = { created: "pending", pending_provider: "pending", paid: "positive", failed: "negative", canceled: "neutral", expired: "neutral" };
const resultLabels = { received: "Received", applied: "Applied", already_processed: "Already processed", review_required: "Review required", rejected: "Rejected", matched_paid: "Matched and paid", still_pending: "Still pending", mismatch: "Mismatch", unsupported: "Unsupported", provider_error: "Provider error" } as const;
const resultAttention: Record<keyof typeof resultLabels, EvidenceAttention> = { received: "pending", applied: "positive", already_processed: "positive", review_required: "review", rejected: "negative", matched_paid: "positive", still_pending: "pending", mismatch: "review", unsupported: "review", provider_error: "negative" };
export const mapPaymentSummary = (value: z.infer<typeof paymentListEnvelopeSchema>["data"]["items"][number]): PaymentSummaryView => ({ ...value, statusLabel: statusLabels[value.status], attention: statusAttention[value.status] });
export const mapPaymentPage = (value: z.infer<typeof paymentListEnvelopeSchema>["data"]): PaymentPageView => ({ ...value, items: value.items.map(mapPaymentSummary) });
export const mapPaymentDetail = (value: z.infer<typeof paymentDetailSchema>): PaymentDetailView => ({ ...value, statusLabel: statusLabels[value.status], attention: statusAttention[value.status], events: value.events.map((event) => ({ ...event, resultLabel: resultLabels[event.processingResult], attention: resultAttention[event.processingResult] })), reconciliations: value.reconciliations.map((record) => ({ ...record, resultLabel: resultLabels[record.comparisonResult], attention: resultAttention[record.comparisonResult] })) });
