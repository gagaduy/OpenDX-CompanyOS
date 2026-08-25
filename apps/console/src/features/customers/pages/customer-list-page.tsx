// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { CustomerOperationsApi } from "../api/customer-api";
import { CustomerTable } from "../components/customer-table";
import { useCustomers } from "../hooks/use-customers";
import type { CustomerQuery, CustomerSegment } from "../types/customer.types";

const segmentIds: readonly CustomerSegment[]=["new_customer","first_time_buyer","repeat_customer","high_value","inactive_90d"];
export function CustomerListPage({api}:{readonly api:CustomerOperationsApi}) {
  const [params,setParams]=useSearchParams();
  const query=useMemo<CustomerQuery>(()=>({ search:clean(params.get("search")), segment:segment(params.get("segment")), page:page(params.get("page")), pageSize:20 }),[params]);
  const {data,segments,error,loading,reload}=useCustomers(api,query);
  const update=(key:string,value:string)=>setParams(current=>{ const next=new URLSearchParams(current); value?next.set(key,value):next.delete(key); if(key!=="page")next.delete("page"); return next; });
  return <section className="catalogWorkspace operationsWorkspace customerWorkspace"><PageHeader eyebrow="Operational CRM" title="Customers" description={`${data?.totalItems??0} registered customers`} /><section className="filterBar" aria-label="Customer filters"><label><span>Search</span><input aria-label="Customer search" value={query.search??""} onChange={event=>update("search",event.target.value)} placeholder="Name, email, phone, ID" /></label><label><span>Segment</span><select aria-label="Customer segment" value={query.segment??""} onChange={event=>update("segment",event.target.value)}><option value="">All segments</option>{(segments?.items.length?segments.items.map(s=>s.id):segmentIds).map(id=><option key={id} value={id}>{label(id)}</option>)}</select></label></section>{loading&&!data?<SystemState kind="loading" title="Loading customers…" />:error?<SystemState kind="error" title="Customers could not be loaded" description={error} action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} />:data?.items.length===0?<SystemState kind="empty" title="No customers match this view." />:data?<><CustomerTable customers={data.items}/><div className="pagination"><span>{loading?"Refreshing…":`Page ${data.page} of ${Math.max(data.totalPages,1)}`}</span><button className="secondaryButton" disabled={data.page<=1} onClick={()=>update("page",String(data.page-1))}>Previous page</button><button className="secondaryButton" disabled={data.page>=data.totalPages} onClick={()=>update("page",String(data.page+1))}>Next page</button></div></>:null}</section>;
}
function clean(value:string|null):string|undefined{ const trimmed=value?.trim(); return trimmed?trimmed:undefined; }
function page(value:string|null):number{ const parsed=Number(value??1); return Number.isSafeInteger(parsed)&&parsed>0?parsed:1; }
function segment(value:string|null):CustomerSegment|undefined{ return segmentIds.find(candidate=>candidate===value); }
function label(value:string):string{ const text=value.replaceAll("_"," "); return text.charAt(0).toUpperCase()+text.slice(1); }
