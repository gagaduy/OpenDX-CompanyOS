// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type FollowupStatus = "open" | "completed";

export interface Followup {
  readonly id: string;
  readonly customerId: string;
  readonly dueAt: string;
  readonly description: string;
  readonly status: FollowupStatus;
  readonly version: number;
  readonly createdById: string;
  readonly assigneeId?: string;
  readonly completedById?: string;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
