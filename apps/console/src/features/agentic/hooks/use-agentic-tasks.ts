// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { AgenticApi } from "../api/agentic-api";
import type { AgenticTaskFilter, AgenticTaskOverview, AgenticTaskPage } from "../types/agentic.types";

export function useAgenticTasks(api: AgenticApi, filter: AgenticTaskFilter) {
  const [data, setData] = useState<AgenticTaskPage>(); const [overview, setOverview] = useState<AgenticTaskOverview>(); const [error, setError] = useState(false); const [loading, setLoading] = useState(true); const [version, setVersion] = useState(0); const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => { const controller = new AbortController(); let active = true; setLoading(true); setError(false); Promise.all([api.listTasks(filter, controller.signal), api.overview(controller.signal)]).then(([page, metrics]) => { if (active) { setData(page); setOverview(metrics); } }).catch((reason: unknown) => { if (active && !(reason instanceof DOMException && reason.name === "AbortError")) setError(true); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; controller.abort(); }; }, [api, filter, version]);
  return { data, overview, error, loading, reload };
}
