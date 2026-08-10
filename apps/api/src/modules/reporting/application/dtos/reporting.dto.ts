// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ReportingRange {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
}

export interface ReportingQueryRange {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
}

export interface ReportingEnvelope<T> {
  readonly data: T;
  readonly refreshedAt: string;
  readonly range: ReportingRange;
}

export interface CommerceReportDto {
  readonly grossPaidRevenueVnd: number;
  readonly paidOrderCount: number;
  readonly averageOrderValueVnd: number;
  readonly conversionRateBasisPoints: number;
  readonly paymentStatuses: readonly PaymentStatusCountDto[];
}

export interface PaymentStatusCountDto {
  readonly status: string;
  readonly count: number;
}

export interface ProductReportDto {
  readonly items: readonly ProductSalesDto[];
  readonly inventory: InventorySnapshotDto;
}

export interface ProductSalesDto {
  readonly sku: string;
  readonly productTitle: string;
  readonly quantitySold: number;
  readonly paidRevenueVnd: number;
}

export interface InventorySnapshotDto {
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly soldOutCount: number;
}

export interface CustomerReportDto {
  readonly totalRegisteredCustomers: number;
  readonly repeatCustomers: number;
  readonly lifetimeValueVnd: number;
  readonly lifetimeValueBuckets: readonly LifetimeValueBucketDto[];
}

export interface LifetimeValueBucketDto {
  readonly bucket: "zero" | "low" | "mid" | "high";
  readonly count: number;
}

export interface OperationsReportDto {
  readonly openTickets: number;
  readonly overdueFollowups: number;
  readonly slaBreaches: number;
}
