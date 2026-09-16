// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {
  Megaphone,
  ShoppingBag,
  Package,
  MessageSquare,
  AlertTriangle,
  Send,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Clock,
} from "lucide-react";
import type { DepartmentCardProps } from "./types";
import type { DepartmentType } from "../../types/department-task-queue.types";

const DEPT_THEMES: Record<
  DepartmentType,
  {
    icon: React.ElementType;
    accentColor: string;
    borderClass: string;
    badgeBg: string;
    textClass: string;
    actionLabel: string;
  }
> = {
  marketing: {
    icon: Megaphone,
    accentColor: "#3b82f6",
    borderClass: "border-blue-500/30",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    textClass: "text-blue-400",
    actionLabel: "Xem chiến dịch",
  },
  merchandising: {
    icon: ShoppingBag,
    accentColor: "#06b6d4",
    borderClass: "border-cyan-500/30",
    badgeBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    textClass: "text-cyan-400",
    actionLabel: "Xem đề xuất giá",
  },
  operations: {
    icon: Package,
    accentColor: "#f59e0b",
    borderClass: "border-amber-500/30",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    textClass: "text-amber-400",
    actionLabel: "Mở đề xuất kho",
  },
  support: {
    icon: MessageSquare,
    accentColor: "#10b981",
    borderClass: "border-emerald-500/30",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    textClass: "text-emerald-400",
    actionLabel: "Mở hộp thư CRM",
  },
};

export const DepartmentCard: React.FC<DepartmentCardProps> = ({
  department,
  displayName,
  employeeCount,
  activeTaskCount,
  status,
  employees,
  queue,
  errorMessage,
  tokenAlert,
  onDirectDispatch,
  onOpenDetails,
  onErrorResolve,
  onSendDirectTask,
  directInputPlaceholder,
  headerExtra,
  alertBanner,
  children,
  directInputMode = false,
  taskFilter = "all",
  onTaskClick,
}) => {
  const [directInput, setDirectInput] = React.useState("");
  const theme = DEPT_THEMES[department] || DEPT_THEMES.marketing;
  const Icon = theme.icon;

  const queueTitle = React.useMemo(() => {
    switch (taskFilter) {
      case "running":
        return "Đang xử lý";
      case "waiting_approval":
        return "Chờ phê duyệt";
      case "completed":
        return "Đã hoàn thành";
      case "failed":
        return "Tác vụ lỗi";
      default:
        return "Hàng đợi";
    }
  }, [taskFilter]);

  return (
    <div
      id={`dept-column-${department}`}
      className={`ccDeptCard ${status === "error" ? "status-error" : ""}`}
    >
      <div className="ccDeptMainBody">
        {/* Header */}
        <div className="ccDeptHeader">
          <div className="ccDeptInfo">
            <div
              className="ccDeptIconBox"
              style={{ backgroundColor: `${theme.accentColor}15` }}
            >
              <Icon size={16} style={{ color: theme.accentColor }} />
            </div>
            <div>
              <h3 className="ccDeptName">
                {displayName}
              </h3>
              <p className="ccDeptSubtext">
                {employeeCount} nhân sự AI | {activeTaskCount} {taskFilter === "all" ? "tác vụ" : queueTitle.toLowerCase()}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            {headerExtra}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {onOpenDetails && (
                <button
                  type="button"
                  onClick={() => onOpenDetails(department)}
                  className="ccDeptDetailsActionBtn"
                  title={`Xem chi tiết: ${theme.actionLabel}`}
                >
                  <span>{theme.actionLabel}</span>
                  <ExternalLink size={10} />
                </button>
              )}
              {/* Status badge */}
              {status === "error" ? (
                <span className="ccDeptStatusBadge status-error">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
                  Có lỗi
                </span>
              ) : status === "waiting_approval" ? (
                <span className="ccDeptStatusBadge status-waiting">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} className="animate-pulse" />
                  Chờ duyệt
                </span>
              ) : status === "running" ? (
                <span className="ccDeptStatusBadge status-running">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} className="animate-pulse" />
                  Đang xử lý
                </span>
              ) : (
                <span className="ccDeptStatusBadge status-idle">
                  Sẵn sàng
                </span>
              )}
            </div>

            {/* Token alert badge for marketing if present */}
            {tokenAlert && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "0.68rem",
                  fontWeight: 500,
                  border: tokenAlert.status === "invalid"
                    ? "1px solid rgba(239, 68, 68, 0.4)"
                    : tokenAlert.status === "warning"
                    ? "1px solid rgba(245, 158, 11, 0.4)"
                    : "1px solid rgba(16, 185, 129, 0.4)",
                  background: tokenAlert.status === "invalid"
                    ? "rgba(239, 68, 68, 0.15)"
                    : tokenAlert.status === "warning"
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(16, 185, 129, 0.15)",
                  color: tokenAlert.status === "invalid"
                    ? "#fca5a5"
                    : tokenAlert.status === "warning"
                    ? "#fcd34d"
                    : "#6ee7b7",
                }}
              >
                {tokenAlert.status === "invalid" ? (
                  <ShieldAlert size={10} />
                ) : tokenAlert.status === "warning" ? (
                  <Zap size={10} />
                ) : (
                  <ShieldCheck size={10} />
                )}
                <span>{tokenAlert.label}</span>
              </span>
            )}
          </div>
        </div>

        {/* Proactive / custom alert banner if present */}
        {alertBanner}

        {/* Department Body: Employees on Top, Queue on Bottom */}
        <div className="ccDeptBodyGrid">
          {/* Section 1: Digital Employees */}
          <div className="ccDeptEmpCol">
            {employees.map((emp) => (
              <div key={emp.id} className="ccEmpRowWrapper">
                <div className="ccEmpRowCompact">
                  <div className="ccEmpRowLeft">
                    <span
                      className="ccEmpAvatarCompact"
                      style={{
                        background: `${theme.accentColor}18`,
                        color: theme.accentColor,
                        borderColor: `${theme.accentColor}35`,
                      }}
                    >
                      {emp.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="ccEmpInfoCompact">
                      <span className="ccEmpIdCompact">{emp.name}</span>
                      <span className="ccEmpRoleCompact" title={emp.role}>{emp.role}</span>
                    </div>
                  </div>
                  <div className="ccEmpRowRight">
                    <span className={`ccEmpStatusCompact status-${emp.status}`}>
                      <span className="ccStatusDot" />
                      <span>
                        {emp.status === "failed"
                          ? "Lỗi xử lý"
                          : emp.status === "working"
                          ? "Đang làm việc"
                          : "Chờ nhiệm vụ"}
                      </span>
                    </span>
                    <span className="ccEmpPercentCompact">
                      {emp.status === "working" ? `${emp.progressPercent}%` : emp.status === "failed" ? "0%" : "--"}
                    </span>
                  </div>
                </div>

                {/* Live Task Message / Activity / Collaboration / Waiting */}
                {(emp.statusText || emp.isCollaborating || (emp.waitingTasksCount !== undefined && emp.waitingTasksCount > 0)) && (
                  <div className={`ccEmpStatusMessage ${emp.status === "working" ? "activeCalc" : ""}`}>
                    {emp.isCollaborating && (
                      <span className="ccCollabPillSmall">
                        ⚡ {emp.collabTag || "Phối hợp liên phòng"}
                      </span>
                    )}
                    {emp.statusText && <span>{emp.statusText}</span>}
                    {emp.waitingTasksCount !== undefined && emp.waitingTasksCount > 0 && (
                      <div className="ccAgentQueueNotice" title="Nhiệm vụ đang xếp hàng chờ tài nguyên này" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.65rem", color: "#fbbf24", marginTop: "2px" }}>
                        <Clock size={11} />
                        <span>{emp.waitingTasksCount} nhiệm vụ đang chờ nhân sự này</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Mini animated progress bar if working */}
                {emp.status === "working" && (
                  <div className="ccEmpTrack" style={{ marginTop: "2px" }}>
                    <div
                      className="ccEmpFill"
                      style={{
                        width: `${emp.progressPercent}%`,
                        backgroundColor: theme.accentColor,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Section 2: Hàng đợi (Queue) & Tác vụ */}
          <div className="ccDeptQueueCol">
            <div className="ccDeptQueueHeader">
              <span className="ccDeptQueueTitle">{queueTitle}</span>
              <span className="ccDeptQueueBadge">
                {queue.length}
              </span>
            </div>
            <div className="ccDeptQueueItems">
              {queue.length === 0 ? (
                <div className="ccDeptQueueEmpty">
                  {taskFilter === "all" ? "Trống" : `Không có tác vụ nào`}
                </div>
              ) : (
                queue.slice(0, 5).map((q) => (
                  <div
                    key={q.id}
                    id={`dept-task-${q.id}`}
                    className="ccDeptQueueItem"
                    onClick={() => onTaskClick?.(q.id)}
                    style={onTaskClick ? { cursor: "pointer" } : undefined}
                    title={q.prompt}
                  >
                    <span
                      className="ccDeptQueueBullet"
                      style={{
                        background:
                          q.status === "completed"
                            ? "#10b981"
                            : q.status === "failed"
                            ? "#ef4444"
                            : q.status === "running"
                            ? "#f59e0b"
                            : "#60a5fa",
                      }}
                    />
                    <span className="ccDeptQueueText">{q.prompt}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Custom children if present */}
        {children && (
          <div style={{ marginTop: "0.5rem", minWidth: 0, overflow: "hidden" }}>
            {children}
          </div>
        )}

        {/* Exception Alert Banner if error exists */}
        {errorMessage && (
          <div className="ccDeptErrorCard">
            <div className="ccDeptErrorText">
              <AlertTriangle size={14} style={{ color: "#f87171", flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
            {onErrorResolve && (
              <button
                type="button"
                onClick={() => onErrorResolve(department)}
                className="ccDeptErrorAction"
              >
                <span>Xem chi tiết →</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Direct Input Field if provided */}
      {directInputPlaceholder && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (directInput.trim() && onSendDirectTask) {
              const val = directInput.trim();
              setDirectInput("");
              void onSendDirectTask(val);
            }
          }}
          className={`ccDeptInputWrap ${directInputMode ? "directInputActive" : ""}`}
          style={directInputMode ? { border: `1px solid ${theme.accentColor}60`, borderRadius: 6, padding: "2px" } : undefined}
        >
          <input
            type="text"
            value={directInput}
            onChange={(e) => setDirectInput(e.target.value)}
            placeholder={directInputPlaceholder}
            className="ccDeptMiniInput"
            style={directInputMode ? { borderColor: theme.accentColor } : undefined}
          />
          <button
            type="submit"
            disabled={!directInput.trim()}
            className="ccDeptMiniSendBtn"
            style={{ opacity: !directInput.trim() ? 0.4 : 1 }}
          >
            <Send size={11} />
          </button>
        </form>
      )}
    </div>
  );
};
