// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { Link } from "react-router-dom";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { AgenticOperationsApi } from "../api/agentic-api";
import { DependencyPanel, getDepartmentProgress } from "../components/dependency-panel";
import { ExecutionSummary } from "../components/execution-summary";
import { ExecutiveReport } from "../components/executive-report";
import { TaskTimeline } from "../components/task-timeline";
import { useAgenticOperations } from "../hooks/use-agentic-operations";
import "../styles/agentic-task-detail.css";

export function AgenticTaskDetailPage({ api, taskId, roles }: { readonly api: AgenticOperationsApi; readonly taskId: string; readonly roles: readonly StaffRole[] }) {
  const { operations, error, canceling, readying, starting, refresh, cancel, markReady, start } = useAgenticOperations(api, taskId);
  const [selectedEventId, setSelectedEventId] = useState<string>();

  if (operations === undefined) {
    const isDenied = error?.toLowerCase().includes("denied") || error?.toLowerCase().includes("forbidden") || error?.toLowerCase().includes("permit");
    const isNotFound = error?.toLowerCase().includes("not found");

    return (
      <section className="catalogWorkspace agenticWorkspace agenticTaskDetail">
        <PageHeader
          eyebrow="Digital Workforce"
          title={error ? "Không thể tải chi tiết tác vụ" : "Đang tải chi tiết tác vụ..."}
          description={`Mã tác vụ: ${taskId}`}
          actions={
            <Link className="secondaryButton" to="/agentic/tasks">
              ← Quay lại Bàn điều hành
            </Link>
          }
        />
        {error ? (
          <SystemState
            kind={isDenied ? "denied" : isNotFound ? "empty" : "error"}
            title={error}
            description={
              isDenied
                ? "Chính sách bảo mật hệ thống (RBAC) giới hạn quyền truy cập chi tiết vận hành đối với vai trò hiện tại của bạn."
                : isNotFound
                ? "Tác vụ này không tồn tại trên hệ thống hoặc đã bị kết thúc / hủy bỏ."
                : "Hệ thống không thể tải dữ liệu tiến trình vận hành của tác vụ này từ máy chủ."
            }
            action={
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                {!isDenied && !isNotFound && (
                  <button className="primaryButton" type="button" onClick={() => void refresh()}>
                    Thử lại
                  </button>
                )}
                <Link className="secondaryButton" to="/agentic/tasks">
                  Về Bàn điều hành
                </Link>
              </div>
            }
          />
        ) : (
          <SystemState
            kind="loading"
            title="Đang tải dữ liệu tiến trình nhân sự AI…"
            description="Đang đồng bộ trạng thái luồng công việc, các nhánh DAG và nhật ký chi phí."
          />
        )}
      </section>
    );
  }

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
  const departmentProgress = getDepartmentProgress(operations.branches);
  return <section className="catalogWorkspace agenticWorkspace agenticTaskDetail">
    <PageHeader
      eyebrow="Digital Workforce"
      title={operations.task.goal}
      description={`Task ${operations.task.id}`}
      actions={
        <Link className="secondaryButton" to="/agentic/tasks">
          ← Quay lại Bàn điều hành
        </Link>
      }
    />
    {error && <p role="alert">{error}</p>}
    <ExecutionSummary state={state} reservedMicros={operations.costs.reservedMicros} settledMicros={operations.costs.settledMicros} refreshedAt={operations.refreshedAt} participatingDepartments={departmentProgress.participating} pendingApprovals={operations.approvals.filter((approval) => approval.state === "pending").length} />
    <div className="agenticTaskActions">{canTransition && state === "draft" && <button className="primaryButton" type="button" disabled={readying || starting} onClick={() => void markReady()}>{readying ? "Marking ready…" : "Mark ready"}</button>}{canTransition && state === "ready" && <button className="primaryButton" type="button" disabled={readying || starting} onClick={() => void start()}>{starting ? "Starting…" : "Start task"}</button>}{canCancel && <button className="secondaryButton" type="button" disabled={canceling} onClick={() => void cancel()}>{canceling ? "Canceling…" : "Cancel workflow"}</button>}<button className="secondaryButton" type="button" onClick={() => void refresh()}>Refresh</button></div>
    <div className="agenticOperationsGrid"><TaskTimeline events={operations.timeline} selectedEventId={selectedEventId} onSelect={setSelectedEventId} /><DependencyPanel branches={operations.branches} /></div>
    <ExecutiveReport report={report} workflowState={state} />
  </section>;
}
