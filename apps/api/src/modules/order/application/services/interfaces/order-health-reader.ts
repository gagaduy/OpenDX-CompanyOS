// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { OrderStatus } from "../../../domain/entities/order";

export interface OrderHealthWindow {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
  readonly limit?: number;
  readonly cursor?: string;
}

export type OrderStalledReason =
  | "PAID_NOT_PROCESSING"
  | "PROCESSING_NOT_READY"
  | "READY_NOT_COMPLETED";

export interface OrderStalledInput extends OrderHealthWindow {
  readonly minimumAgeMinutes?: number;
}

export interface OrderStalledFact {
  readonly orderId: string;
  readonly status: "paid" | "processing" | "ready_for_fulfillment";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly totalVnd: number;
}

export interface OrderStalledResult {
  readonly summary: {
    readonly stalledCount: number;
    readonly stalledTotalVnd: number;
    readonly countsByStatus: readonly { readonly status: string; readonly count: number }[];
  };
  readonly evidence: readonly (OrderStalledFact & {
    readonly ageMinutes: number;
    readonly reasonCode: OrderStalledReason;
  })[];
  readonly nextCursor?: string;
}

export type OrderInvalidReason =
  | "PAID_TIMESTAMP_MISSING"
  | "COMPLETED_TIMESTAMP_MISSING"
  | "TERMINAL_TIMESTAMP_CONFLICT"
  | "ILLEGAL_STATUS_TRANSITION";

export interface OrderInvalidEvidence {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly version: number;
  readonly detectedAt: string;
  readonly reasonCodes: readonly OrderInvalidReason[];
}

export interface OrderInvalidStateResult {
  readonly summary: {
    readonly invalidCount: number;
    readonly reasonCounts: readonly {
      readonly reasonCode: OrderInvalidReason;
      readonly count: number;
    }[];
  };
  readonly evidence: readonly OrderInvalidEvidence[];
  readonly nextCursor?: string;
}

export interface OrderExpiryRiskInput extends OrderHealthWindow {
  readonly horizonMinutes?: number;
}

export interface OrderExpiryRiskFact {
  readonly orderId: string;
  readonly status: "pending_payment";
  readonly totalVnd: number;
  readonly reservationExpiresAt: string;
}

export interface OrderExpiryRiskResult {
  readonly summary: {
    readonly atRiskCount: number;
    readonly atRiskTotalVnd: number;
    readonly earliestExpiryAt: string | null;
  };
  readonly evidence: readonly (OrderExpiryRiskFact & { readonly minutesRemaining: number })[];
  readonly nextCursor?: string;
}

export interface SupportOrderContext {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly createdAt: string;
  readonly reservationExpiresAt: string;
  readonly totalVnd: number;
  readonly backendConfirmedPaid: boolean;
}

export interface SupportOrderContextReader {
  getAuthorizedContext(orderId: string): Promise<SupportOrderContext | undefined>;
}

export interface OrderHealthReader {
  stalledSummary(input: OrderStalledInput): Promise<OrderStalledResult>;
  invalidStateEvidence(input: OrderHealthWindow): Promise<OrderInvalidStateResult>;
  expiryRisk(input: OrderExpiryRiskInput): Promise<OrderExpiryRiskResult>;
}

export interface OrderHealthQuery extends OrderHealthWindow {
  readonly asOf: string;
  readonly limit: number;
  readonly after?: readonly unknown[];
}

export interface OrderHealthRepository {
  readStalledOrders(
    session: DatabaseSession,
    query: OrderHealthQuery & { readonly minimumAgeMinutes: number },
  ): Promise<Omit<OrderStalledResult, "nextCursor" | "evidence"> & {
    readonly evidence: readonly OrderStalledFact[];
  }>;
  readInvalidStateEvidence(
    session: DatabaseSession,
    query: OrderHealthQuery,
  ): Promise<Omit<OrderInvalidStateResult, "nextCursor">>;
  readExpiryRisk(
    session: DatabaseSession,
    query: OrderHealthQuery & { readonly horizonMinutes: number },
  ): Promise<Omit<OrderExpiryRiskResult, "nextCursor" | "evidence"> & {
    readonly evidence: readonly OrderExpiryRiskFact[];
  }>;
  findSupportContext(
    session: DatabaseSession,
    orderId: string,
  ): Promise<(Omit<SupportOrderContext, "backendConfirmedPaid"> & {
    readonly paidAt?: string;
  }) | undefined>;
}
