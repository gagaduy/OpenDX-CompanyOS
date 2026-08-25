// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { paymentDetailSchema, paymentListEnvelopeSchema, paymentStatusSchema } from "../schemas/payment-api.schema";

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type EvidenceAttention = "neutral" | "pending" | "review" | "positive" | "negative";
type SummaryDto = z.infer<typeof paymentListEnvelopeSchema>["data"]["items"][number];
type DetailDto = z.infer<typeof paymentDetailSchema>;
export type PaymentSummaryView = SummaryDto & { readonly statusLabel: string; readonly attention: EvidenceAttention };
export type PaymentEventView = DetailDto["events"][number] & { readonly resultLabel: string; readonly attention: EvidenceAttention };
export type PaymentReconciliationView = DetailDto["reconciliations"][number] & { readonly resultLabel: string; readonly attention: EvidenceAttention };
export type PaymentDetailView = Omit<DetailDto, "events" | "reconciliations"> & PaymentSummaryView & { readonly events: readonly PaymentEventView[]; readonly reconciliations: readonly PaymentReconciliationView[] };
export interface PaymentPageView { readonly items: readonly PaymentSummaryView[]; readonly page: number; readonly pageSize: number; readonly totalItems: number; readonly totalPages: number; }
export interface PaymentQuery { readonly status?: PaymentStatus; readonly page: number; readonly pageSize: number; }
