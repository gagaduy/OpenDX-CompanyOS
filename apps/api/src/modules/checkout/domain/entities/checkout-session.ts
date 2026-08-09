// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CheckoutStatus = "created" | "order_created" | "completed" | "expired" | "canceled";
export interface CheckoutSession {
  readonly id: string;
  readonly customerId: string;
  readonly sourceCartId: string;
  readonly sourceCartVersion: number;
  readonly addressSnapshot: Readonly<Record<string, unknown>>;
  readonly contactSnapshot: Readonly<Record<string, unknown>>;
  readonly promotionId?: string;
  readonly promotionCode?: string;
  readonly promotionVersion?: number;
  readonly subtotalVnd: number;
  readonly discountVnd: number;
  readonly totalVnd: number;
  readonly currency: "VND";
  readonly taxMode: "included_not_separated";
  readonly status: CheckoutStatus;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly orderId?: string;
  readonly expiresAt: string;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
