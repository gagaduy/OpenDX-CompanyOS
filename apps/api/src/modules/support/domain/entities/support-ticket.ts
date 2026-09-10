// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type TicketPriority = "urgent" | "high" | "normal" | "low";
export type TicketStatus = "new" | "assigned" | "in_progress" | "waiting_customer" | "waiting_internal" | "escalated" | "resolved" | "closed";

export interface SupportTicket {
  readonly id: string;
  readonly customerId: string;
  readonly customerEmail?: string;
  readonly orderId?: string;
  readonly subject: string;
  readonly description: string;
  readonly priority: TicketPriority;
  readonly status: TicketStatus;
  readonly version: number;
  readonly createdById: string;
  readonly assigneeId?: string;
  readonly slaPausedSeconds: number;
  readonly slaStoppedSeconds: number;
  readonly slaPauseStartedAt?: string;
  readonly slaStoppedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
