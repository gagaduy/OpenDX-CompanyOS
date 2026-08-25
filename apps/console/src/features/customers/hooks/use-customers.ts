// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { CustomerOperationsApi } from "../api/customer-api";
import type { CustomerPageView, CustomerQuery, CustomerSegmentListView } from "../types/customer.types";

export function useCustomers(api:CustomerOperationsApi, query:CustomerQuery){
  const [data,setData]=useState<CustomerPageView>(); const [segments,setSegments]=useState<CustomerSegmentListView>(); const [error,setError]=useState<string>(); const [loading,setLoading]=useState(true); const [version,setVersion]=useState(0); const reload=useCallback(()=>setVersion(v=>v+1),[]);
  useEffect(()=>{ const controller=new AbortController(); let active=true; setLoading(true); setError(undefined); Promise.all([api.search(query,controller.signal),api.segments(controller.signal).catch(()=>({items:[],calculatedAt:""}))]).then(([page,segmentList])=>{ if(active){ setData(page); setSegments(segmentList); } }).catch((reason:unknown)=>{ if(active&&!(reason instanceof DOMException&&reason.name==="AbortError"))setError("Customers could not be loaded."); }).finally(()=>{ if(active)setLoading(false); }); return()=>{ active=false; controller.abort(); }; },[api,query,version]);
  return {data,segments,error,loading,reload};
}
