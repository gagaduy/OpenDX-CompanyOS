// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { OperationsReportView } from "../types/dashboard.types";
import { MetricCard } from "./metric-card";

export function OperationsSummary({ operations }: { readonly operations: OperationsReportView }) {
  const { aiUsage } = operations;
  return (
    <section className="dashboardSection" aria-label="Operational focus">
      <h2 className="dashboardSectionTitle">Operational focus</h2>
      <div className="dashboardGrid dashboardOperationalGrid">
        <MetricCard label="Open tickets" value={operations.openTickets} />
        <MetricCard label="Overdue follow-ups" value={operations.overdueFollowups} />
        <MetricCard label="SLA breaches" value={operations.slaBreaches} />
        {aiUsage ? (
          <>
            <MetricCard
              label="AI Tokens Consumed"
              value={(aiUsage.rangeTokens ?? aiUsage.totalTokens).toLocaleString("vi-VN")}
              changeLabel="Lượng token tiêu thụ trong kỳ"
              meta={`Tất cả: ${aiUsage.totalTokens.toLocaleString("vi-VN")} (${aiUsage.modelRuns} lượt chạy)`}
            />
            <MetricCard
              label="Chi phí AI quy đổi"
              value={formatVnd(aiUsage.rangeCostVnd ?? aiUsage.estimatedCostVnd)}
              changeLabel="Chi phí AI trong kỳ"
              meta={`≈ $${(((aiUsage.rangeCostVnd ?? aiUsage.estimatedCostVnd)) / 25400).toFixed(2)} USD (Tất cả: ${formatVnd(aiUsage.estimatedCostVnd)})`}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
