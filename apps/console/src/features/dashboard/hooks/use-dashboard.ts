// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { DashboardApi } from "../api/dashboard-api";
import type { DashboardRangeInput, DashboardView } from "../types/dashboard.types";

export function useDashboard(api:DashboardApi,range:DashboardRangeInput){const [data,setData]=useState<DashboardView>();const [error,setError]=useState<string>();const [loading,setLoading]=useState(true);const load=useCallback((signal?:AbortSignal)=>{setLoading(true);setError(undefined);return api.load(range,signal).then(setData).catch(reason=>{if(reason instanceof DOMException&&reason.name==="AbortError")return;setError("Dashboard metrics could not be loaded.");}).finally(()=>setLoading(false));},[api,range]);useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]);return{data,error,loading,reload:()=>void load()};}
