// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CommerceDailyPointDto,
  CustomerDailyPointDto,
  LifetimeValueBucketDto,
  OperationsReportDto,
  ProductReportDto,
  ReportingQueryRange,
} from "../../dtos/reporting.dto";

export interface CommerceReportFacts {
  readonly grossPaidRevenueVnd: number;
  readonly paidOrderCount: number;
  readonly createdOrderCount: number;
  readonly paidCreatedOrderCount: number;
  readonly previousGrossPaidRevenueVnd: number;
  readonly previousPaidOrderCount: number;
  readonly daily: readonly CommerceDailyPointDto[];
  readonly paymentStatuses: readonly {
    readonly status: string;
    readonly count: number;
  }[];
}

export interface CustomerReportFacts {
  readonly totalRegisteredCustomers: number;
  readonly repeatCustomers: number;
  readonly lifetimeValueVnd: number;
  readonly lifetimeValueBuckets: readonly LifetimeValueBucketDto[];
  readonly newCustomersInRange: number;
  readonly previousNewCustomersInRange: number;
  readonly dailyNewCustomers: readonly CustomerDailyPointDto[];
}

export interface ReportingRepository {
  getCommerce(range: ReportingQueryRange): Promise<CommerceReportFacts>;
  getProducts(range: ReportingQueryRange): Promise<ProductReportDto>;
  getCustomers(range: ReportingQueryRange): Promise<CustomerReportFacts>;
  getOperations(range: ReportingQueryRange): Promise<OperationsReportDto>;
}
