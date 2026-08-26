// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { AgenticApiError, type AgenticApi } from "../api/agentic-api";
import type { AgenticApprovalDecision, AgenticApprovalDetail, AgenticApprovalPage } from "../types/agentic.types";

export function useAgenticApprovals(api: AgenticApi) {
  const [page, setPage] = useState<AgenticApprovalPage>();
  const [detail, setDetail] = useState<AgenticApprovalDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const loadPage = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(undefined);
    try { setPage(await api.listApprovals(1, 25, signal)); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("Approvals could not be loaded."); }
    finally { setLoading(false); }
  }, [api]);
  const select = useCallback(async (id: string, signal?: AbortSignal) => {
    setError(undefined);
    try { setDetail(await api.loadApproval(id, signal)); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("Approval detail could not be loaded."); }
  }, [api]);
  useEffect(() => { const request = new AbortController(); void loadPage(request.signal); return () => request.abort(); }, [loadPage]);
  const decide = useCallback(async (input: AgenticApprovalDecision) => {
    if (detail === undefined) return false;
    try {
      await api.decideApproval(detail.approval.id, input);
      await loadPage();
      await select(detail.approval.id);
      return true;
    } catch (cause) {
      if (cause instanceof AgenticApiError && cause.code === "STALE_VERSION") await select(detail.approval.id);
      setError("Approval decision was not applied. The authoritative state was refreshed.");
      return false;
    }
  }, [api, detail, loadPage, select]);
  return { page, detail, loading, error, loadPage, select, decide };
}
