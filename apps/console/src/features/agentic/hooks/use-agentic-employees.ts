// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { AgenticApi } from "../api/agentic-api";
import type { AgenticEmployeeDetail, AgenticEmployeeSummary, AgentKind } from "../types/agentic.types";

export function useAgenticEmployees(api: AgenticApi) {
  const [employees, setEmployees] = useState<readonly AgenticEmployeeSummary[]>([]);
  const [detail, setDetail] = useState<AgenticEmployeeDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const select = useCallback(async (kind: AgentKind, signal?: AbortSignal) => { setError(undefined); try { setDetail(await api.loadEmployee(kind, signal)); } catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("Digital Employee detail could not be loaded."); } }, [api]);
  useEffect(() => { const request = new AbortController(); void api.listEmployees(request.signal).then(setEmployees).catch((cause) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("Digital Employees could not be loaded."); }).finally(() => setLoading(false)); return () => request.abort(); }, [api]);
  return { employees, detail, loading, error, select };
}

export function useAgenticEmployee(api: AgenticApi, kind?: AgentKind) {
  const [detail, setDetail] = useState<AgenticEmployeeDetail>(); const [error, setError] = useState<string>();
  useEffect(() => { if (kind === undefined) return; const request = new AbortController(); void api.loadEmployee(kind, request.signal).then(setDetail).catch((cause) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("Digital Employee detail could not be loaded."); }); return () => request.abort(); }, [api, kind]);
  return { detail, error };
}
