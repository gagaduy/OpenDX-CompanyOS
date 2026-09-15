// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CommandActivityDepartment = "marketing" | "merchandising" | "operations" | "support";
export type CommandActivityDecision = "approved" | "canceled";
export type CommandActivityResourceType =
  | "marketing_campaign"
  | "merchandising_proposal"
  | "operations_proposal"
  | "support_proposal";

export interface CommandActivityEvent {
  readonly id: string;
  readonly actorId: string;
  readonly department: CommandActivityDepartment;
  readonly decision: CommandActivityDecision;
  readonly resourceType: CommandActivityResourceType;
  readonly resourceId: string;
  readonly summary: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}

export type CreateCommandActivityInput = Pick<
  CommandActivityEvent,
  "department" | "decision" | "resourceType" | "resourceId" | "summary" | "idempotencyKey"
>;
