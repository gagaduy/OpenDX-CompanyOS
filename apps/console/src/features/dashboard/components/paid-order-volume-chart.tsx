// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CommerceDailyPointView } from "../types/dashboard.types";

export function PaidOrderVolumeChart({ points }: { readonly points: readonly CommerceDailyPointView[] }) {
  const maximum = Math.max(...points.map((point) => point.paidOrderCount), 1);
  const empty = points.every((point) => point.paidOrderCount === 0);
  const barWidth = points.length === 0 ? 0 : 580 / points.length;
  return <section className="detailCard dashboardChartCard">
    <div className="dashboardChartHeader"><div><p className="sectionKicker">Order volume</p><h2>Daily paid orders</h2></div><strong>{points.reduce((sum, point) => sum + point.paidOrderCount, 0)}</strong></div>
    {empty ? <p className="dashboardChartEmpty">No paid activity in this range</p> : <svg role="img" aria-label="Paid order volume" viewBox="0 0 640 200"><title>Paid order volume</title>{points.map((point,index)=>{const height=point.paidOrderCount===0?0:Math.max(3,point.paidOrderCount*160/maximum);return <rect className="dashboardChartBar" key={point.date} x={30+index*barWidth} y={180-height} width={Math.max(2,barWidth-4)} height={height} />;})}</svg>}
    {empty ? <svg className="srOnly" role="img" aria-label="Paid order volume" viewBox="0 0 1 1"><title>Paid order volume</title></svg> : null}
    <table className="srOnly" aria-label="Paid order volume data"><thead><tr><th>Date</th><th>Paid orders</th></tr></thead><tbody>{points.map((point)=><tr key={point.date}><td>{point.date}</td><td>{point.paidOrderCount}</td></tr>)}</tbody></table>
  </section>;
}
