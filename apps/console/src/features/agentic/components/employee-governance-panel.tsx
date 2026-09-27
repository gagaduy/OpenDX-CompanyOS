// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticEmployeeDetail } from "../types/agentic.types";

function formatMicros(micros: number): string {
  if (micros === 0) return "$0.00 (Chưa cấp)";
  const usd = micros / 1_000_000;
  const vnd = Math.round(usd * 25_400);

  if (usd >= 1) {
    return `$${usd.toFixed(2)} USD (~${vnd.toLocaleString("vi-VN")} ₫)`;
  }
  if (usd >= 0.01) {
    return `$${usd.toFixed(3)} USD (~${vnd.toLocaleString("vi-VN")} ₫)`;
  }
  return `$${usd.toFixed(4)} USD (~${vnd.toLocaleString("vi-VN")} ₫)`;
}

function formatDateTime(isoString?: string): string {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const pad = (n: number) => n.toString().padStart(2, "0");
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

function departmentLabel(department: string): string {
  switch (department.toLowerCase()) {
    case "marketing_content":
      return "Marketing (Content)";
    case "marketing_visual":
      return "Marketing (Visual)";
    case "marketing_publisher":
      return "Marketing (Publisher)";
    default:
      return department;
  }
}

function statusBadge(state: string): { label: string; className: string } {
  switch (state.toLowerCase()) {
    case "available":
      return { label: "Sẵn sàng (Available)", className: "available" };
    case "degraded":
      return { label: "Cảnh báo (Degraded)", className: "degraded" };
    case "revoked":
      return { label: "Đã thu hồi (Revoked)", className: "revoked" };
    default:
      return { label: state, className: "unknown" };
  }
}

export function EmployeeGovernancePanel({
  employee,
}: {
  readonly employee: AgenticEmployeeDetail;
}) {
  const status = statusBadge(employee.executionHealth.state);

  return (
    <section className="agenticEmployeeDetail">
      <header>
        <h2>{departmentLabel(employee.department)} governance</h2>
        <span className={`statusPill ${status.className}`}>
          {status.label}
        </span>
      </header>
      <p>
        Bằng chứng vận hành dựa trên {employee.executionHealth.basis.replaceAll("_", " ")}, làm mới lúc{" "}
        <strong>{formatDateTime(employee.executionHealth.freshness)}</strong>.
      </p>
      <dl className="metricList">
        <div>
          <dt>Cấu hình quản trị</dt>
          <dd>
            {employee.governance.active
              ? `Active · Phiên bản v${employee.governance.configurationVersion}`
              : "Not configured"}
          </dd>
        </div>
        <div>
          <dt>Trạng thái thu hồi</dt>
          <dd>
            {employee.governance.revoked
              ? "Đã thu hồi (Revoked)"
              : "Bình thường (Not revoked)"}
          </dd>
        </div>
        <div>
          <dt>Primary model</dt>
          <dd>
            <code>{employee.models.primary}</code>
          </dd>
        </div>
        <div>
          <dt>Fallback models</dt>
          <dd>
            {employee.models.fallbacks.length > 0 ? (
              <code>{employee.models.fallbacks.join(", ")}</code>
            ) : (
              "None (Không có)"
            )}
          </dd>
        </div>
        <div>
          <dt>Hạn mức mỗi tác vụ</dt>
          <dd>
            <strong>{formatMicros(employee.budgets.taskCostMicros)}</strong>
          </dd>
        </div>
        <div>
          <dt>Hạn mức ngày</dt>
          <dd>
            <strong>{formatMicros(employee.budgets.dailyCostMicros)}</strong>
          </dd>
        </div>
        <div>
          <dt>Hạn mức tháng</dt>
          <dd>
            <strong>{formatMicros(employee.budgets.monthlyCostMicros)}</strong>
          </dd>
        </div>
      </dl>

      <h3>Approved tools and data scope</h3>
      {employee.tools.length === 0 ? (
        <p>No approved tools (Chưa cấu hình công cụ nghiệp vụ riêng lẻ).</p>
      ) : (
        <ul className="agenticToolList">
          {employee.tools.map((tool) => (
            <li key={`${tool.name}:${tool.version}`}>
              <strong>{tool.name}</strong> <span>v{tool.version}</span> · Phạm vi:{" "}
              <code>{tool.dataScope}</code>
            </li>
          ))}
        </ul>
      )}

      <h3>Recent runs</h3>
      {employee.recentRuns.length === 0 ? (
        <p>No recent terminal runs (Chưa có lịch sử chạy gần đây).</p>
      ) : (
        <ul className="agenticRunList">
          {employee.recentRuns.map((run) => (
            <li
              key={`${run.taskId}:${run.completedAt ?? run.state}`}
              className="agenticRunItem"
            >
              <div className="runHeader">
                <span className={`runBadge ${run.state}`}>
                  {run.state.toUpperCase()}
                </span>
                <span className="runCost">
                  {formatMicros(run.settledCostMicros)}
                </span>
              </div>
              <div className="runMeta">
                <span>{formatDateTime(run.completedAt)}</span>
                <span className="runTaskId" title={run.taskId}>
                  Task: {run.taskId.slice(0, 8)}...
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
