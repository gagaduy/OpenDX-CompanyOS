// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface AgenticAnalyticsWindow {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
}

export interface AgenticVariantSales {
  readonly variantId: string;
  readonly windowDate: string;
  readonly paidQuantity: number;
  readonly paidRevenueVnd: number;
  readonly currentUnitPriceVnd: number;
}

export interface AgenticCustomerSegmentSnapshot {
  readonly segmentKey: "high_value" | "inactive" | "repeat" | "new";
  readonly lifetimeValueBucket: "zero" | "low" | "mid" | "high";
  readonly recencyBucket: "never" | "0_30_days" | "31_90_days" | "over_90_days";
  readonly customerCount: number;
  readonly repeatCustomerCount: number;
  readonly openFollowupCount: number;
  readonly customersWithOpenFollowupCount: number;
  readonly lifetimePaidRevenueVnd: number;
  readonly asOfDate: string;
}

export interface AgenticCustomerActivity {
  readonly activityDate: string;
  readonly newCustomerCount: number;
  readonly paidCustomerCount: number;
  readonly paidRevenueVnd: number;
}

export interface AgenticAnalyticsReader {
  getVariantSales(window: AgenticAnalyticsWindow): Promise<readonly AgenticVariantSales[]>;
  getCustomerSegmentSnapshot(asOf: string): Promise<readonly AgenticCustomerSegmentSnapshot[]>;
  getCustomerActivity(window: AgenticAnalyticsWindow): Promise<readonly AgenticCustomerActivity[]>;
}
