// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { PageHeader } from "../../../shared/components/page-header";
import type { AgenticOperationsApi } from "../api/agentic-api";
import { DependencyPanel } from "../components/dependency-panel";
import { ExecutionSummary } from "../components/execution-summary";
import { ExecutiveReport } from "../components/executive-report";
import { TaskTimeline } from "../components/task-timeline";
import { useAgenticOperations } from "../hooks/use-agentic-operations";

export function AgenticTaskDetailPage({ api, taskId, roles }: { readonly api: AgenticOperationsApi; readonly taskId: string; readonly roles: readonly StaffRole[] }) {
  const { operations, error, canceling, readying, starting, refresh, cancel, markReady, start } = useAgenticOperations(api, taskId);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  if (operations === undefined) return <section>{error ? <p role="alert">{error}</p> : <p>Loading task operations…</p>}</section>;
  const state = operations.workflow?.state ?? operations.task.state;
  const branchOwners = new Map(operations.branches.map(({ id, owner }) => [id, owner]));
  const report = operations.report === undefined ? undefined : {
    ...operations.report,
    unavailableBranches: operations.report.unavailableBranches.map((branch) => ({
      ...branch, subtaskId: branchOwners.get(branch.subtaskId) ?? branch.subtaskId,
    })),
  };
  const canCancel = roles.some((role) => role === "administrator" || role === "agentic_operator") && !["partially_completed", "failed", "canceled", "completed"].includes(state) && operations.workflow !== undefined;
  const canTransition = roles.some((role) => role === "administrator" || role === "agentic_operator");
  return <section className="catalogWorkspace agenticWorkspace agenticTaskDetail">
    <PageHeader eyebrow="Digital Workforce" title={operations.task.goal} description={`Task ${operations.task.id}`} />
    {error && <p role="alert">{error}</p>}
    <ExecutionSummary state={state} reservedMicros={operations.costs.reservedMicros} settledMicros={operations.costs.settledMicros} refreshedAt={operations.refreshedAt} />
    <div className="agenticTaskActions">{canTransition && state === "draft" && <button className="primaryButton" type="button" disabled={readying || starting} onClick={() => void markReady()}>{readying ? "Marking ready…" : "Mark ready"}</button>}{canTransition && state === "ready" && <button className="primaryButton" type="button" disabled={readying || starting} onClick={() => void start()}>{starting ? "Starting…" : "Start task"}</button>}{canCancel && <button className="secondaryButton" type="button" disabled={canceling} onClick={() => void cancel()}>{canceling ? "Canceling…" : "Cancel workflow"}</button>}<button className="secondaryButton" type="button" onClick={() => void refresh()}>Refresh</button></div>
    <div className="agenticOperationsGrid"><TaskTimeline events={operations.timeline} selectedEventId={selectedEventId} onSelect={setSelectedEventId} /><DependencyPanel branches={operations.branches} /></div>
    <ExecutiveReport report={report} workflowState={state} />
  </section>;
}
