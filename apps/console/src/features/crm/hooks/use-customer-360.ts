// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { CrmOperationsApi } from "../api/crm-api";
import type { Customer360View } from "../types/crm.types";

export function useCustomer360(api:CrmOperationsApi, customerId:string|undefined){
  const [data,setData]=useState<Customer360View>(); const [error,setError]=useState<string>(); const [loading,setLoading]=useState(true); const [version,setVersion]=useState(0); const reload=useCallback(()=>setVersion(v=>v+1),[]);
  useEffect(()=>{ if(!customerId){ setError("Customer identifier is missing."); setLoading(false); return; } const controller=new AbortController(); let active=true; setLoading(true); setError(undefined); api.getCustomer(customerId,controller.signal).then(value=>{ if(active)setData(value); }).catch((reason:unknown)=>{ if(active&&!(reason instanceof DOMException&&reason.name==="AbortError"))setError(message(reason)); }).finally(()=>{ if(active)setLoading(false); }); return()=>{ active=false; controller.abort(); }; },[api,customerId,version]);
  return {data,error,loading,reload,replace:setData};
}
function message(reason:unknown):string{ if(typeof reason==="object"&&reason!==null&&"code" in reason){ if(reason.code==="FORBIDDEN")return "Permission denied."; if(reason.code==="CUSTOMER_NOT_FOUND")return "Customer was not found."; } return reason instanceof Error?reason.message:"Customer could not be loaded."; }
