// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgenticApi } from "../api/agentic-api";
import type { AgenticTaskFilter, AgenticTaskOverview, AgenticTaskPage } from "../types/agentic.types";

export interface UseAgenticTasksOptions {
  readonly pollIntervalMs?: number;
}

export function useAgenticTasks(
  api: AgenticApi,
  filter: AgenticTaskFilter,
  options?: UseAgenticTasksOptions,
) {
  const [data, setData] = useState<AgenticTaskPage>();
  const [overview, setOverview] = useState<AgenticTaskOverview>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const fetchTasks = async (isBackground = false) => {
      if (!isBackground) {
        setLoading(true);
      }
      setError(false);
      try {
        const [page, metrics] = await Promise.all([
          api.listTasks(filter, controller.signal),
          api.overview(controller.signal),
        ]);
        if (mountedRef.current && !controller.signal.aborted) {
          setData(page);
          setOverview(metrics);
        }
      } catch (reason: unknown) {
        if (
          mountedRef.current &&
          !controller.signal.aborted &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setError(true);
        }
      } finally {
        if (mountedRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchTasks(false);

    if (options?.pollIntervalMs && options.pollIntervalMs > 0) {
      const interval = options.pollIntervalMs;
      const poll = () => {
        pollTimer = setTimeout(async () => {
          if (mountedRef.current && !controller.signal.aborted && !document.hidden) {
            await fetchTasks(true);
          }
          if (mountedRef.current && !controller.signal.aborted) {
            poll();
          }
        }, interval);
      };
      poll();
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && mountedRef.current && !controller.signal.aborted) {
        void fetchTasks(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      controller.abort();
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [api, filter, version, options?.pollIntervalMs]);

  return { data, overview, error, loading, reload };
}
