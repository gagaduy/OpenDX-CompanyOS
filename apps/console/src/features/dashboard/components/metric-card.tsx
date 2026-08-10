// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export function MetricCard({label,value,meta}:{readonly label:string;readonly value:string|number;readonly meta?:string}){return <article className="detailCard metricCard"><h2>{label}</h2><strong>{value}</strong>{meta?<p className="subtleText">{meta}</p>:null}</article>;}
