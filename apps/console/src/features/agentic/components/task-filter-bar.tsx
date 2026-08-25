// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticTaskState } from "../types/agentic.types";
export const agenticTaskStates: readonly AgenticTaskState[] = ["draft", "ready", "received", "planning", "awaiting_plan_approval", "dispatching", "department_analysis", "quality_review", "collaboration", "executive_synthesis", "awaiting_human_approval", "retrying", "partially_completed", "failed", "canceled", "completed"];
export function TaskFilterBar({ state, onChange }: { readonly state?: AgenticTaskState; readonly onChange: (state?: AgenticTaskState) => void }) { return <div className="filterBar"><label><span>State</span><select aria-label="Task state" value={state ?? ""} onChange={(event) => onChange(agenticTaskStates.find((candidate) => candidate === event.target.value))}><option value="">All states</option>{agenticTaskStates.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div>; }
