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
}) => {
  const [directInput, setDirectInput] = React.useState("");
  const theme = DEPT_THEMES[department] || DEPT_THEMES.marketing;
  const Icon = theme.icon;

  return (
    <div
      id={`dept-column-${department}`}
      className={`ccDeptCard ${status === "error" ? "status-error" : ""}`}
    >
      <div>
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
                {employeeCount} nhân sự AI | {activeTaskCount} tác vụ
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            {headerExtra}
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

        {/* Custom children or fallback to Digital Employees List */}
        {children ? (
          <div style={{ padding: "0.5rem 0", display: "flex", flexDirection: "column", gap: "0.5rem" }}>{children}</div>
        ) : (
          <div className="ccEmployeeList">
            {employees.map((emp) => (
              <div key={emp.id} className="ccEmployeeRow">
                <div className="ccEmpMain">
                  <div className="ccEmpLeft">
                    <span className="ccEmpAvatar">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="ccEmpId">{emp.name}</span>
                    <span className="ccEmpRole">{emp.role}</span>
                  </div>
                  <div className="ccEmpStatusWrap">
                    <span className={`ccEmpStatus ${emp.status}`}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: emp.status === "failed" ? "#ef4444" : emp.status === "working" ? "#22c55e" : "#64748b", display: "inline-block" }} />
                      {emp.status === "failed"
                        ? "Lỗi xử lý"
                        : emp.status === "working"
                        ? "Đang làm việc"
                        : "Chờ nhiệm vụ"}
                    </span>
                    <span className="ccEmpPercent">
                      {emp.status === "working" ? `${emp.progressPercent}%` : "--"}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="ccEmpTrack">
                  <div
                    className="ccEmpFill"
                    style={{
                      width: `${emp.progressPercent}%`,
                      background: emp.status === "failed"
                        ? "#ef4444"
                        : emp.status === "working"
                        ? theme.accentColor
                        : "#475569",
                    }}
                  />
                </div>
              </div>
            ))}
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

        {/* Task Queue list */}
        {queue.length > 0 && (
          <div className="ccDeptQueueBox">
            <div className="ccDeptQueueHeader">
              <span>Hàng đợi:</span>
              <span className="ccDeptQueueBadge">
                {queue.length}
              </span>
            </div>
            <div>
              {queue.slice(0, 2).map((q) => (
                <div
                  key={q.id}
                  className="ccDeptQueueItem"
                >
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#3b82f6", display: "inline-block", flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.prompt}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Direct Input Field */}
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
            className="ccDeptInputWrap"
          >
            <input
              type="text"
              value={directInput}
              onChange={(e) => setDirectInput(e.target.value)}
              placeholder={directInputPlaceholder}
              className="ccDeptMiniInput"
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

      {/* Footer buttons */}
      <div style={{ marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={() => onDirectDispatch(department)}
          style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.72rem", color: "#94a3b8", background: "transparent", border: "none", cursor: "pointer", padding: "3px 6px", borderRadius: "4px" }}
        >
          <Send size={11} />
          <span>Giao việc phòng ban</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenDetails(department)}
          style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.72rem", fontWeight: 600, color: theme.accentColor, background: "transparent", border: "none", cursor: "pointer" }}
        >
          <span>{theme.actionLabel}</span>
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
};
