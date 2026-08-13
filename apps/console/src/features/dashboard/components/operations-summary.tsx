// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OperationsReportView } from "../types/dashboard.types";
import { MetricCard } from "./metric-card";

export function OperationsSummary({ operations }: { readonly operations: OperationsReportView }) {
  return <section className="dashboardSection" aria-label="Operational focus">
    <h2 className="dashboardSectionTitle">Operational focus</h2>
    <div className="dashboardGrid dashboardOperationalGrid">
      <MetricCard label="Open tickets" value={operations.openTickets} />
      <MetricCard label="Overdue follow-ups" value={operations.overdueFollowups} />
      <MetricCard label="SLA breaches" value={operations.slaBreaches} />
    </div>
  </section>;
}
