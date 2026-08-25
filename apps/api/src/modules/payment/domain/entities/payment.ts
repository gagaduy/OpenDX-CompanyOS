// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PaymentStatus = "created" | "pending_provider" | "paid" | "failed" | "canceled" | "expired";
export interface Payment {
  readonly id: string;
  readonly orderId: string;
  readonly provider: "sepay";
  readonly expectedAmountVnd: number;
  readonly currency: "VND";
  readonly status: PaymentStatus;
  readonly activeAttemptId?: string;
  readonly paidAt?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
