// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { AgenticApi } from "../api/agentic-api";
import type { AgenticAuditFilter, AgenticAuditPage } from "../types/agentic.types";

export function useAgenticAudit(api: AgenticApi, filter: AgenticAuditFilter) {
  const [page, setPage] = useState<AgenticAuditPage>(); const [error, setError] = useState<string>();
  useEffect(() => { const request = new AbortController(); setError(undefined); void api.listAudit(filter, request.signal).then(setPage).catch((cause) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("Agentic audit could not be loaded."); }); return () => request.abort(); }, [api, filter]);
  return { page, error };
}
