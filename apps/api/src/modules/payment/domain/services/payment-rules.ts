// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Payment, PaymentStatus } from "../entities/payment";
import type { PaymentAttempt } from "../entities/payment-attempt";
import { PaymentDomainError } from "../exceptions/payment-domain.error";

const transitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  created: ["pending_provider", "failed", "canceled", "expired"],
  pending_provider: ["paid", "failed", "canceled", "expired"],
  paid: [], failed: [], canceled: [], expired: [],
};

export function createProviderInvoiceNumber(attemptId: string): string {
  const normalized = attemptId.replaceAll("-", "").toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(normalized)) invalid("Payment attempt ID is invalid");
  return `NVC-PAY-${normalized}`;
}

export function transitionPayment(payment: Payment, target: PaymentStatus, timestamp: string): Payment {
  validatePayment(payment);
  if (payment.status === target) return payment;
  if (!transitions[payment.status].includes(target)) transitionError(payment.status, target);
  validateTimestamp(timestamp);
  return { ...payment, status: target, version: payment.version + 1, updatedAt: timestamp, ...(target === "paid" ? { paidAt: timestamp } : {}) };
}

export function transitionPaymentAttempt(attempt: PaymentAttempt, target: PaymentStatus, timestamp: string): PaymentAttempt {
  if (!/^NVC-PAY-[A-F0-9]{32}$/.test(attempt.providerInvoiceNumber)) invalid("Provider invoice is invalid");
  if (attempt.state === target) return attempt;
  if (!transitions[attempt.state].includes(target)) transitionError(attempt.state, target);
  validateTimestamp(timestamp);
  return { ...attempt, state: target, updatedAt: timestamp };
}

export function validatePayment(payment: Payment): void {
  if (payment.provider !== "sepay" || payment.currency !== "VND" || !Number.isSafeInteger(payment.expectedAmountVnd) || payment.expectedAmountVnd <= 0 || payment.version <= 0) invalid("Payment is invalid");
}
function validateTimestamp(value: string): void { if (!Number.isFinite(Date.parse(value))) invalid("Payment timestamp is invalid"); }
function transitionError(current: PaymentStatus, target: PaymentStatus): never { throw new PaymentDomainError("INVALID_PAYMENT_TRANSITION", `Cannot transition payment from ${current} to ${target}`); }
function invalid(message: string): never { throw new PaymentDomainError("INVALID_PAYMENT", message); }
