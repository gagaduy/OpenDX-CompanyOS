// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { FormEvent, useMemo, useState } from "react";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { DashboardApi } from "../api/dashboard-api";
import { CommerceSummary } from "../components/commerce-summary";
import { OperationsSummary } from "../components/operations-summary";
import { ProductPerformance } from "../components/product-performance";
import { RevenueTrendChart } from "../components/revenue-trend-chart";
import { PaidOrderVolumeChart } from "../components/paid-order-volume-chart";
import { useDashboard } from "../hooks/use-dashboard";
import type { DashboardRangeInput } from "../types/dashboard.types";

const DAY_MS = 86_400_000;
const DASHBOARD_TIME_ZONE = "Asia/Ho_Chi_Minh";
const dashboardDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DASHBOARD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function DashboardPage({ api }: { readonly api: DashboardApi }) {
  const initial = useMemo(defaultRange, []);
  const [range, setRange] = useState<DashboardRangeInput>(initial);
  const [draft, setDraft] = useState<DashboardRangeInput>(initial);
  const [rangeError, setRangeError] = useState<string>();
  const { data, error, loading, reload } = useDashboard(api, range);
  const apply = (event: FormEvent) => { event.preventDefault(); const days = (Date.parse(`${draft.end}T00:00:00.000Z`) - Date.parse(`${draft.start}T00:00:00.000Z`)) / DAY_MS; if (!Number.isFinite(days) || days < 1 || days > 366) { setRangeError("Choose a range from 1 to 366 days."); return; } setRangeError(undefined); setRange(draft); };
  const stale = data !== undefined && Date.now() - Date.parse(data.refreshedAt) > 60_000;

  return <section className="catalogWorkspace operationsWorkspace dashboardWorkspace"><PageHeader eyebrow="Executive reporting" title="Commerce dashboard" description="Aggregate, PII-free metrics in Asia/Ho_Chi_Minh." /><form className="filterBar" aria-label="Dashboard date range" onSubmit={apply}><label><span>Start date</span><input aria-label="Start date" type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label><label><span>End date</span><input aria-label="End date" type="date" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label><button className="primaryButton" type="submit">Apply range</button></form>{rangeError ? <div className="pageState" role="alert">{rangeError}</div> : null}{loading && !data ? <SystemState kind="loading" title="Loading dashboard metrics…" /> : error ? <SystemState kind="error" title="Dashboard metrics could not be loaded" description={error} action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} /> : data ? <><p className="subtleText technicalText">Range {data.range.start} to {data.range.end}; refreshed {new Date(data.refreshedAt).toLocaleString("vi-VN")}</p>{stale ? <div className="pageState" role="alert">Metrics are older than 60 seconds.</div> : null}<CommerceSummary commerce={data.commerce} customers={data.customers} /><OperationsSummary operations={data.operations} /><section className="dashboardSection" aria-label="Performance overview"><h2 className="dashboardSectionTitle">Performance overview</h2><div className="dashboardPerformanceGrid"><RevenueTrendChart points={data.commerce.daily} /><PaidOrderVolumeChart points={data.commerce.daily} /><ProductPerformance products={data.products} /></div></section></> : null}</section>;
}

function defaultRange(): DashboardRangeInput {
  const now = Date.now();
  const end = dashboardDateFormatter.format(new Date(now + DAY_MS));
  const start = dashboardDateFormatter.format(new Date(now - 29 * DAY_MS));
  return { start, end };
}
