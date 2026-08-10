// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { CommerceReportView } from "../types/dashboard.types";
import { MetricCard } from "./metric-card";

export function CommerceSummary({commerce}:{readonly commerce:CommerceReportView}){return <section className="dashboardGrid" aria-label="Commerce summary"><MetricCard label="Gross paid revenue" value={formatVnd(commerce.grossPaidRevenueVnd)}/><MetricCard label="Paid orders" value={commerce.paidOrderCount}/><MetricCard label="Average order value" value={formatVnd(commerce.averageOrderValueVnd)}/><MetricCard label="Conversion rate" value={`${(commerce.conversionRateBasisPoints/100).toLocaleString("vi-VN")}%`}/></section>;}
