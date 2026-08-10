// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useParams } from "react-router-dom";
import type { CrmOperationsApi } from "../api/crm-api";
import { CustomerSummary } from "../components/customer-summary";
import { CustomerTimeline } from "../components/customer-timeline";
import { FollowupPanel } from "../components/followup-panel";
import { useCustomer360 } from "../hooks/use-customer-360";
import type { FollowupView } from "../types/crm.types";

export function CustomerDetailPage({api}:{readonly api:CrmOperationsApi}){ const {customerId}=useParams(); const {data,error,loading,reload,replace}=useCustomer360(api,customerId); const [mutationError,setMutationError]=useState<string>(); const [status,setStatus]=useState<string>(); const [pending,setPending]=useState<string>(); const [lastClaim,setLastClaim]=useState<FollowupView>(); const claim=async(followup:FollowupView)=>{ if(!customerId)return; setPending(followup.id); setMutationError(undefined); setStatus(undefined); setLastClaim(followup); try{ const updated=await api.updateFollowup(customerId,followup.id,{action:"claim",version:followup.version}); if(data)replace({...data,followups:data.followups.map(item=>item.id===updated.id?updated:item)}); setStatus("Follow-up claimed"); }catch(reason){ setMutationError(reason instanceof Error?reason.message:"Follow-up could not be updated."); }finally{ setPending(undefined); } }; const retry=()=>{ if(lastClaim)void claim(lastClaim); }; if(loading&&!data)return <section className="pageState" role="status">Loading customer…</section>; if(error)return <section className="pageState" role="alert"><h1>{error}</h1><button className="secondaryButton" type="button" onClick={reload}>Retry</button></section>; if(!data)return null; return <section className="catalogWorkspace operationsWorkspace customerWorkspace"><header className="workspaceHeader splitHeader"><div><p className="sectionKicker">Customer 360</p><h1>{data.customer.fullName??data.customer.email}</h1><p>{data.customer.id}</p></div></header>{mutationError?<div className="pageState" role="alert"><p>{mutationError}</p><button className="secondaryButton" type="button" onClick={retry}>Retry claim</button></div>:null}{status?<div className="pageState" role="status">{status}</div>:null}<div className="detailGrid"><CustomerSummary view={data}/><FollowupPanel followups={data.followups} onClaim={claim} pending={pending}/><CustomerTimeline view={data}/></div></section>; }
