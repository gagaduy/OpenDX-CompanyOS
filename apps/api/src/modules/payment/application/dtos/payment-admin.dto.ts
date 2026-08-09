// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { PaymentStatus } from "../../domain/entities/payment";

export interface PaymentStaffContext {
  readonly actorId: string;
  readonly roles: readonly string[];
  readonly correlationId: string;
}

export interface PaymentListQuery {
  readonly status?: PaymentStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface PaymentSummaryDto {
  readonly id: string;
  readonly orderId: string;
  readonly status: PaymentStatus;
  readonly expectedAmountVnd: number;
  readonly currency: "VND";
  readonly invoiceNumber: string;
  readonly providerOrderId?: string;
  readonly updatedAt: string;
}

export interface PaymentDetailDto extends PaymentSummaryDto {
  readonly attemptId: string;
  readonly expiresAt: string;
  readonly events: readonly PaymentEventDto[];
  readonly reconciliations: readonly PaymentReconciliationDto[];
}

export interface PaymentEventDto {
  readonly id: string;
  readonly notificationType: string;
  readonly providerEventId?: string;
  readonly providerOrderId?: string;
  readonly providerTransactionId?: string;
  readonly amountVnd?: number;
  readonly currency?: "VND";
  readonly normalizedState: "paid" | "unsupported" | "invalid";
  readonly processingResult:
    | "received"
    | "applied"
    | "already_processed"
    | "review_required"
    | "rejected";
  readonly failureReason?: string;
  readonly redactedPayload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly receivedAt: string;
  readonly processedAt?: string;
}

export interface PaymentReconciliationDto {
  readonly id: string;
  readonly triggerActorType: "staff" | "system";
  readonly providerOrderId?: string;
  readonly internalStatus: PaymentStatus;
  readonly providerStatus?: string;
  readonly internalAmountVnd: number;
  readonly providerAmountVnd?: number;
  readonly comparisonResult:
    | "matched_paid"
    | "still_pending"
    | "mismatch"
    | "unsupported"
    | "provider_error";
  readonly redactedResponse?: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly createdAt: string;
}

export interface PaymentListDto {
  readonly items: readonly PaymentSummaryDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface ReconcilePaymentRequest {
  readonly providerOrderId?: string;
}
