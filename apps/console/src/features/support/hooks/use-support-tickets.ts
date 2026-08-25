// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { SupportOperationsApi } from "../api/support-api";
import type { SupportQuery, SupportTicketPageView } from "../types/support.types";

export function useSupportTickets(api:SupportOperationsApi, query:SupportQuery){ const [data,setData]=useState<SupportTicketPageView>(); const [error,setError]=useState<string>(); const [loading,setLoading]=useState(true); const load=useCallback((signal?:AbortSignal)=>{setLoading(true);setError(undefined);return api.list(query,signal).then(setData).catch(reason=>{if(reason instanceof DOMException&&reason.name==="AbortError")return;setError("Support tickets could not be loaded.");}).finally(()=>setLoading(false));},[api,query]); useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]); return {data,error,loading,reload:()=>void load()}; }
