// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { SupportOrderContext } from "../../../../order";
import type { TicketPriority, TicketStatus } from "../../../domain/entities/support-ticket";

export interface SupportHealthWindow {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
  readonly limit?: number;
  readonly cursor?: string;
}

export interface SupportSlaRiskInput extends SupportHealthWindow {
  readonly horizonMinutes?: number;
}

export type SupportSlaRiskCode = "BREACHED" | "DUE_WITHIN_HORIZON";
export type SupportOperationalClass =
  | "unassigned"
  | "active_work"
  | "waiting_customer"
  | "waiting_internal"
  | "escalated"
  | "terminal";

export interface SupportSlaFact {
  readonly ticketId: string;
  readonly priority: TicketPriority;
  readonly status: TicketStatus;
  readonly slaDueAt: string;
}

export interface SupportSlaRiskResult {
  readonly summary: {
    readonly openTickets: number;
    readonly atRiskCount: number;
    readonly breachedCount: number;
    readonly countsByPriority: readonly { readonly priority: TicketPriority; readonly count: number }[];
  };
  readonly evidence: readonly (SupportSlaFact & {
    readonly minutesRemaining: number;
    readonly riskCode: SupportSlaRiskCode;
  })[];
  readonly nextCursor?: string;
}

export interface SupportClassificationSummary {
  readonly countsByPriority: readonly { readonly priority: TicketPriority; readonly count: number }[];
  readonly countsByStatus: readonly { readonly status: TicketStatus; readonly count: number }[];
  readonly operationalClasses: readonly {
    readonly class: SupportOperationalClass;
    readonly count: number;
  }[];
  readonly unassignedCount: number;
  readonly escalatedCount: number;
}

export type SupportRelatedOrderResult =
  | { readonly ticketId: string; readonly hasRelatedOrder: false }
  | {
    readonly ticketId: string;
    readonly hasRelatedOrder: true;
    readonly orderId: string;
    readonly orderStatus: string;
    readonly orderCreatedAt: string;
    readonly reservationExpiresAt: string;
    readonly totalVnd: number;
    readonly paymentConfirmed: boolean;
  };

export interface SupportHealthReader {
  slaRisk(input: SupportSlaRiskInput): Promise<SupportSlaRiskResult>;
  classificationSummary(input: SupportHealthWindow): Promise<SupportClassificationSummary>;
}

export interface SupportOrderReferenceReader {
  findRelatedOrder(ticketId: string): Promise<SupportRelatedOrderResult>;
}

export interface SupportHealthQuery extends SupportHealthWindow {
  readonly asOf: string;
  readonly limit: number;
  readonly horizonMinutes: number;
  readonly after?: readonly unknown[];
}

export interface SupportHealthRepository {
  readSlaRisk(
    session: DatabaseSession,
    query: SupportHealthQuery,
  ): Promise<Omit<SupportSlaRiskResult, "nextCursor" | "evidence"> & {
    readonly evidence: readonly SupportSlaFact[];
  }>;
  readClassificationSummary(
    session: DatabaseSession,
    input: SupportHealthWindow & { readonly asOf: string },
  ): Promise<SupportClassificationSummary>;
  findRelatedOrderId(
    session: DatabaseSession,
    ticketId: string,
  ): Promise<{ readonly found: boolean; readonly orderId: string | null }>;
}

export interface SupportHealthDependencies {
  readonly repository: SupportHealthRepository;
  readonly orders: { getAuthorizedContext(orderId: string): Promise<SupportOrderContext | undefined> };
}
