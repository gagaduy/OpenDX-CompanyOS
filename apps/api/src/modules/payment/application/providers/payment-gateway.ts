// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PaymentMethod } from "../../domain/entities/payment-attempt";

export interface PaymentFormField { readonly name: string; readonly value: string; }
export interface PaymentInitiation {
  readonly actionUrl: string;
  readonly method: "POST";
  readonly fields: readonly PaymentFormField[];
}
export interface CreateProviderCheckoutRequest {
  readonly amountVnd: number;
  readonly invoiceNumber: string;
  readonly orderDescription: string;
  readonly customerId: string;
  readonly paymentMethod?: PaymentMethod;
}
export interface ProviderOrderDetail {
  readonly providerOrderId: string;
  readonly invoiceNumber: string;
  readonly status: string;
  readonly amountVnd: number;
  readonly currency: "VND";
  readonly transactionApproved: boolean;
  readonly redactedEvidence: Readonly<Record<string, unknown>>;
}
export interface NormalizedPaymentNotification {
  readonly notificationType: string;
  readonly providerEventId: string;
  readonly providerOrderId: string;
  readonly providerTransactionId: string;
  readonly invoiceNumber: string;
  readonly orderStatus: string;
  readonly transactionStatus: string;
  readonly amountVnd: number;
  readonly currency: string;
  readonly state: "paid" | "unsupported";
  readonly redactedPayload: Readonly<Record<string, unknown>>;
}
export interface PaymentGateway {
  createCheckout(request: CreateProviderCheckoutRequest): Promise<PaymentInitiation>;
  getOrderDetail(providerOrderId: string): Promise<ProviderOrderDetail>;
  normalizeNotification(payload: unknown): NormalizedPaymentNotification;
}
export type PaymentGatewayErrorCategory = "not_configured" | "timeout" | "unauthorized" | "not_found" | "provider_error" | "invalid_response";
export class PaymentGatewayError extends Error {
  constructor(readonly category: PaymentGatewayErrorCategory, message: string) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}
