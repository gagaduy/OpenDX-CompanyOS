// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { CommerceDailyPointView } from "../types/dashboard.types";

export function RevenueTrendChart({ points }: { readonly points: readonly CommerceDailyPointView[] }) {
  const values = points.map((point) => point.grossPaidRevenueVnd);
  const line = toPoints(values, 620, 180, 16);
  const area = line === "" ? "" : `M ${line.replaceAll(" ", " L ")} L 604 180 L 16 180 Z`;
  const empty = values.every((value) => value === 0);
  return <section className="detailCard dashboardChartCard">
    <div className="dashboardChartHeader"><div><p className="sectionKicker">Revenue trend</p><h2>Daily paid revenue</h2></div><strong>{formatVnd(values.reduce((sum, value) => sum + value, 0))}</strong></div>
    {empty ? <p className="dashboardChartEmpty">No paid activity in this range</p> : <svg role="img" aria-label="Revenue trend" viewBox="0 0 640 200"><title>Revenue trend</title><path className="dashboardChartArea" d={area} /><polyline className="dashboardChartLine" points={line} fill="none" vectorEffect="non-scaling-stroke" /></svg>}
    {empty ? <svg className="srOnly" role="img" aria-label="Revenue trend" viewBox="0 0 1 1"><title>Revenue trend</title></svg> : null}
    <DataTable label="Revenue trend data" points={points} value={(point) => formatVnd(point.grossPaidRevenueVnd)} heading="Revenue" />
  </section>;
}

function DataTable({ label, points, value, heading }: { readonly label:string; readonly points:readonly CommerceDailyPointView[]; readonly value:(point:CommerceDailyPointView)=>string|number; readonly heading:string }) {
  return <table className="srOnly" aria-label={label}><thead><tr><th>Date</th><th>{heading}</th></tr></thead><tbody>{points.map((point)=><tr key={point.date}><td>{point.date}</td><td>{value(point)}</td></tr>)}</tbody></table>;
}

function toPoints(values: readonly number[], width:number, height:number, padding:number): string {
  if (values.length === 0) return "";
  const maximum = Math.max(...values, 1);
  return values.map((value,index)=>`${values.length === 1 ? width / 2 : padding + index * (width-padding*2)/(values.length-1)},${height-padding-value*(height-padding*2)/maximum}`).join(" ");
}
