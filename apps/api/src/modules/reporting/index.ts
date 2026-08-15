// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createAgenticAnalyticsReader,
  createReportingModule,
  type ReportingModuleDependencies,
} from "./reporting.module";
export type {
  AgenticAnalyticsReader,
  AgenticAnalyticsWindow,
  AgenticCustomerActivity,
  AgenticCustomerSegmentSnapshot,
  AgenticVariantSales,
} from "./application/services/interfaces/agentic-analytics-reader";
