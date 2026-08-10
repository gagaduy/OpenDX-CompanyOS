// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CustomerReportDto,
  OperationsReportDto,
  ProductReportDto,
  ReportingQueryRange,
} from "../../dtos/reporting.dto";

export interface CommerceReportFacts {
  readonly grossPaidRevenueVnd: number;
  readonly paidOrderCount: number;
  readonly createdOrderCount: number;
  readonly paidCreatedOrderCount: number;
  readonly paymentStatuses: readonly {
    readonly status: string;
    readonly count: number;
  }[];
}

export interface ReportingRepository {
  getCommerce(range: ReportingQueryRange): Promise<CommerceReportFacts>;
  getProducts(range: ReportingQueryRange): Promise<ProductReportDto>;
  getCustomers(range: ReportingQueryRange): Promise<CustomerReportDto>;
  getOperations(range: ReportingQueryRange): Promise<OperationsReportDto>;
}
