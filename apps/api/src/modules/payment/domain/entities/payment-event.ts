// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface PaymentEvent {
  readonly id: string;
  readonly paymentId?: string;
  readonly attemptId?: string;
  readonly provider: "sepay";
  readonly authenticationResult: "authenticated" | "rejected";
  readonly notificationType: string;
  readonly providerEventId?: string;
  readonly providerOrderId?: string;
  readonly providerTransactionId?: string;
  readonly providerInvoiceNumber: string;
  readonly amountVnd?: number;
  readonly currency?: "VND";
  readonly redactedPayload: Readonly<Record<string, unknown>>;
  readonly payloadHash: string;
  readonly normalizedState: "paid" | "unsupported" | "invalid";
  readonly processingResult: "received" | "applied" | "already_processed" | "review_required" | "rejected";
  readonly failureReason?: string;
  readonly correlationId: string;
  readonly receivedAt: string;
  readonly processedAt?: string;
}
