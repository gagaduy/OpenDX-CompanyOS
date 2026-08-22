// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { SupportOperationsApi } from "../api/support-api";
import type { SupportTicketDetailView } from "../types/support.types";

export function useSupportTicket(api:SupportOperationsApi, ticketId:string|undefined){ const [data,setData]=useState<SupportTicketDetailView>(); const [error,setError]=useState<string>(); const [loading,setLoading]=useState(true); const load=useCallback((signal?:AbortSignal)=>{ if(ticketId===undefined){setError("Ticket was not found.");setLoading(false);return Promise.resolve();} setLoading(true);setError(undefined);return api.detail(ticketId,signal).then(setData).catch(reason=>{if(reason instanceof DOMException&&reason.name==="AbortError")return;setError(reason instanceof Error?reason.message:"Support ticket could not be loaded.");}).finally(()=>setLoading(false));},[api,ticketId]); useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]); return {data,error,loading,reload:()=>void load(),replace:setData}; }
