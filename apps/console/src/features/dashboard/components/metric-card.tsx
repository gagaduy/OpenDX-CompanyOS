// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { MetricSparkline } from "./metric-sparkline";

interface MetricCardProps { readonly label:string; readonly value:string|number; readonly meta?:string; readonly changeBasisPoints?:number|null; readonly changeLabel?:string; readonly sparklineValues?:readonly number[]; }

export function MetricCard({label,value,meta,changeBasisPoints,changeLabel,sparklineValues}:MetricCardProps){const change=changeBasisPoints===undefined?undefined:formatChange(changeBasisPoints);const tone=changeTone(changeBasisPoints);return <article className="detailCard metricCard"><h2>{label}</h2><div className="metricCardBody"><div><strong>{value}</strong>{change?<p className={`metricChange metricChange-${tone}`}>{change}</p>:null}{changeLabel?<p className="subtleText">{changeLabel}</p>:null}{meta?<p className="subtleText">{meta}</p>:null}</div>{sparklineValues?<MetricSparkline values={sparklineValues}/>:null}</div></article>;}

function formatChange(value:number|null):string{if(value===null)return "New in period";if(value===0)return "No change";const percentage=(Math.abs(value)/100).toLocaleString("vi-VN",{maximumFractionDigits:2});return `${value>0?"+":"-"}${percentage}%`;}

function changeTone(value:number|null|undefined):"positive"|"negative"|"neutral"{if(value===undefined||value===null||value===0)return "neutral";return value>0?"positive":"negative";}
