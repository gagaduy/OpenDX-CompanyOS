// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CommerceReportDto,
  CustomerReportDto,
  OperationsReportDto,
  ProductReportDto,
  ReportingEnvelope,
} from "../../dtos/reporting.dto";

export interface ReportingRequestRange {
  readonly start?: string;
  readonly end?: string;
}

export interface ReportingContext {
  readonly actorId: string;
  readonly roles: readonly string[];
  readonly correlationId: string;
}

export interface ReportingServiceContract {
  getCommerce(range: ReportingRequestRange, context?: ReportingContext): Promise<ReportingEnvelope<CommerceReportDto>>;
  getProducts(range: ReportingRequestRange, context?: ReportingContext): Promise<ReportingEnvelope<ProductReportDto>>;
  getCustomers(range: ReportingRequestRange, context?: ReportingContext): Promise<ReportingEnvelope<CustomerReportDto>>;
  getOperations(range: ReportingRequestRange, context?: ReportingContext): Promise<ReportingEnvelope<OperationsReportDto>>;
}
