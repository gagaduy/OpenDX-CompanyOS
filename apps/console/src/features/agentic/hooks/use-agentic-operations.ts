// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { AgenticTaskOperations } from "../types/agentic.types";

const terminal = new Set(["partially_completed", "failed", "canceled", "completed"]);

export function useAgenticOperations(api: AgenticOperationsApi, taskId: string) {
  const [operations, setOperations] = useState<AgenticTaskOperations>();
  const [error, setError] = useState<string>();
  const [canceling, setCanceling] = useState(false);
  const [readying, setReadying] = useState(false);
  const [starting, setStarting] = useState(false);
  const transitioning = useRef<"ready" | "start" | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  const clear = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const load = useCallback(async () => {
    clear();
    if (document.hidden || !navigator.onLine) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const next = await api.loadOperations(taskId, request.signal);
      if (!mounted.current || request.signal.aborted) return;
      setOperations(next);
      setError(undefined);
      if (!terminal.has(next.workflow?.state ?? next.task.state)) timer.current = setTimeout(() => void load(), 5_000);
    } catch (cause) {
      if (!mounted.current || request.signal.aborted) return;
      setError("Task operations could not be refreshed.");
      timer.current = setTimeout(() => void load(), 15_000);
    }
  }, [api, clear, taskId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const resume = () => {
      if (document.hidden || !navigator.onLine) { clear(); controller.current?.abort(); return; }
      void load();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      mounted.current = false;
      clear();
      controller.current?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [clear, load]);

  const cancel = useCallback(async () => {
    if (operations?.workflow === undefined || canceling) return;
    setCanceling(true);
    try { await api.cancelWorkflow(operations.workflow.id, operations.workflow.version, "CANCELED_BY_STAFF"); }
    catch { setError("Cancellation outcome is uncertain; authoritative state was refreshed."); }
    finally { setCanceling(false); await load(); }
  }, [api, canceling, load, operations?.workflow]);

  const markReady = useCallback(async () => {
    if (operations?.task.state !== "draft" || transitioning.current !== undefined) return;
    transitioning.current = "ready";
    setReadying(true);
    setError(undefined);
    let outcomeError: string | undefined;
    try { await api.readyTask(taskId, operations.task.version); }
    catch { outcomeError = "Task readiness outcome is uncertain; authoritative state was refreshed."; }
    finally { transitioning.current = undefined; setReadying(false); await load(); if (outcomeError !== undefined) setError(outcomeError); }
  }, [api, load, operations?.task.state, operations?.task.version, taskId]);

  const start = useCallback(async () => {
    if (operations?.task.state !== "ready" || transitioning.current !== undefined) return;
    transitioning.current = "start";
    setStarting(true);
    setError(undefined);
    let outcomeError: string | undefined;
    try { await api.startTask(taskId, operations.task.version, 1); }
    catch { outcomeError = "Task start outcome is uncertain; authoritative state was refreshed."; }
    finally { transitioning.current = undefined; setStarting(false); await load(); if (outcomeError !== undefined) setError(outcomeError); }
  }, [api, load, operations?.task.state, operations?.task.version, taskId]);

  return { operations, error, canceling, readying, starting, refresh: load, cancel, markReady, start };
}
