// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticExecutiveReport } from "../types/agentic.types";

export interface ExecutiveReportProps { readonly report?: AgenticExecutiveReport; readonly workflowState: string }
export function ExecutiveReport({ report, workflowState }: ExecutiveReportProps) {
  if (report === undefined) return <section><h2>Executive report</h2><p>{["completed", "partially_completed"].includes(workflowState) ? "No settled report is available." : "Waiting for immutable report settlement."}</p></section>;
  return <section><h2>Executive report</h2><p>{report.summary}</p>{report.unavailableBranches.length > 0 && <><h3>Unavailable Departments</h3><ul>{report.unavailableBranches.map(({ subtaskId, reasonCode }) => <li key={subtaskId}>{title(subtaskId)}: {reasonCode}</li>)}</ul></>}</section>;
}
function title(value: string): string { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
