// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useRef, useState } from "react";
import type { AgenticApi } from "../api/agentic-api";
import type { AgenticTaskIntake } from "../types/agentic.types";
export function useAgenticIntake(api: AgenticApi) { const key = useRef(`console:task:${crypto.randomUUID()}`); const inFlight = useRef(false); const [submitting, setSubmitting] = useState(false); const [message, setMessage] = useState<string>(); const submit = useCallback(async (input: AgenticTaskIntake) => { if (inFlight.current) return; inFlight.current = true; setSubmitting(true); setMessage(undefined); try { await api.createTask(input, key.current); setMessage("Task created."); } catch { setMessage("Task could not be created. Retry uses the same request key."); } finally { inFlight.current = false; setSubmitting(false); } }, [api]); return { submit, submitting, message }; }
