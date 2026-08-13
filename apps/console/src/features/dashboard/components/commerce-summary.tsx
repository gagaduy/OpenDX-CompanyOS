// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { CommerceReportView, CustomerReportView } from "../types/dashboard.types";
import { MetricCard } from "./metric-card";

export function CommerceSummary({ commerce, customers }: { readonly commerce: CommerceReportView; readonly customers: CustomerReportView }) {
  return <section className="dashboardSection" aria-label="Executive metrics">
    <h2 className="dashboardSectionTitle">Executive metrics</h2>
    <div className="dashboardGrid dashboardExecutiveGrid">
      <MetricCard label="Gross paid revenue" value={formatVnd(commerce.grossPaidRevenueVnd)} />
      <MetricCard label="Paid orders" value={commerce.paidOrderCount} />
      <MetricCard label="Average order value" value={formatVnd(commerce.averageOrderValueVnd)} />
      <MetricCard label="Conversion rate" value={`${(commerce.conversionRateBasisPoints / 100).toLocaleString("vi-VN")}%`} />
      <MetricCard label="Registered customers" value={customers.totalRegisteredCustomers} />
      <MetricCard label="Repeat customers" value={customers.repeatCustomers} />
    </div>
  </section>;
}
