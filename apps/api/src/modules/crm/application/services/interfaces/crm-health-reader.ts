// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface CrmHealthWindow {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
}

export type CrmLifetimeValueBucket = "zero" | "low" | "mid" | "high";
export type CrmRecencyBucket = "0_30_days" | "31_90_days" | "over_90_days" | "never";
export type CrmHealthSegment = "new" | "repeat" | "high_value" | "inactive";
export type FollowupOpportunityReason =
  | "OVERDUE_FOLLOWUP"
  | "UNASSIGNED_FOLLOWUP"
  | "SEGMENT_WITHOUT_OPEN_FOLLOWUP";

export interface CrmSegmentHealth {
  readonly registeredCustomers: number;
  readonly newCustomers: number;
  readonly repeatCustomers: number;
  readonly customersByLifetimeValueBucket: readonly {
    readonly bucket: CrmLifetimeValueBucket;
    readonly count: number;
  }[];
  readonly customersByRecencyBucket: readonly {
    readonly bucket: CrmRecencyBucket;
    readonly count: number;
  }[];
  readonly paidRevenueVnd: number;
}

export interface CrmFollowupHealth {
  readonly openFollowups: number;
  readonly overdueFollowups: number;
  readonly unassignedFollowups: number;
  readonly customersWithoutOpenFollowupBySegment: readonly {
    readonly segment: CrmHealthSegment;
    readonly count: number;
  }[];
  readonly reasonCounts: readonly {
    readonly reasonCode: FollowupOpportunityReason;
    readonly count: number;
  }[];
}

export interface CrmHealthReader {
  segmentSummary(input: CrmHealthWindow): Promise<CrmSegmentHealth>;
  followupOpportunities(input: CrmHealthWindow): Promise<CrmFollowupHealth>;
}

export interface CrmFollowupSummary {
  readonly openFollowups: number;
  readonly overdueFollowups: number;
  readonly unassignedFollowups: number;
}

export interface CrmHealthRepository {
  readFollowupSummary(
    session: DatabaseSession,
    input: CrmHealthWindow & { readonly asOf: string },
  ): Promise<CrmFollowupSummary>;
}
