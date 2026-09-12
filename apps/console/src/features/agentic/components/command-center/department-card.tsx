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
      className={`bg-[#0a0b10] border ${theme.borderClass} rounded-xl p-4 flex flex-col justify-between shadow-sm transition-all hover:border-white/20`}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/[0.08]"
              style={{ backgroundColor: `${theme.accentColor}15` }}
            >
              <Icon size={16} style={{ color: theme.accentColor }} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white leading-tight">
                {displayName}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {employeeCount} nhân sự AI | {activeTaskCount} tác vụ
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {headerExtra}
            {/* Status badge */}
            {status === "error" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Có lỗi
              </span>
            ) : status === "waiting_approval" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Chờ duyệt
              </span>
            ) : status === "running" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Đang xử lý
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-white/[0.06]">
                Sẵn sàng
              </span>
            )}

            {/* Token alert badge for marketing if present */}
            {tokenAlert && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                  tokenAlert.status === "invalid"
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    : tokenAlert.status === "warning"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                }`}
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
          <div className="py-2 space-y-2">{children}</div>
        ) : (
          <div className="py-2.5 space-y-2">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-200 font-medium truncate">
                      {emp.name} <span className="text-slate-500 font-normal">({emp.role})</span>
                    </span>
                    <span
                      className={`font-semibold shrink-0 text-[10px] ${
                        emp.status === "failed"
                          ? "text-rose-400"
                          : emp.status === "working"
                          ? "text-emerald-400"
                          : "text-slate-400"
                      }`}
                    >
                      {emp.status === "failed"
                        ? "Lỗi xử lý"
                        : emp.status === "working"
                        ? `${emp.progressPercent}%`
                        : "--"}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        emp.status === "failed"
                          ? "bg-rose-500"
                          : emp.status === "working"
                          ? "bg-emerald-500"
                          : "bg-slate-600"
                      }`}
                      style={{ width: `${emp.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Exception Alert Banner if error exists */}
        {errorMessage && (
          <div className="my-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-300 font-medium leading-snug break-words">
                {errorMessage}
              </p>
            </div>
            {onErrorResolve && (
              <button
                type="button"
                onClick={() => onErrorResolve(department)}
                className="shrink-0 text-[11px] text-rose-300 font-semibold hover:text-white underline inline-flex items-center gap-0.5"
              >
                <span>Xem chi tiết →</span>
              </button>
            )}
          </div>
        )}

        {/* Task Queue list */}
        {queue.length > 0 && (
          <div className="mt-1 pt-2 border-t border-white/[0.04]">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Hàng đợi:</span>
              <span className="font-mono text-[10px] bg-white/[0.06] px-1.5 py-0.2 rounded text-slate-300">
                {queue.length}
              </span>
            </div>
            <div className="space-y-1">
              {queue.slice(0, 2).map((q) => (
                <div
                  key={q.id}
                  className="text-[11px] text-slate-300 bg-[#11131a] px-2 py-1 rounded border border-white/[0.04] truncate"
                >
                  {q.prompt}
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
            className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center gap-1.5"
          >
            <input
              type="text"
              value={directInput}
              onChange={(e) => setDirectInput(e.target.value)}
              placeholder={directInputPlaceholder}
              className="flex-1 bg-[#11131a] text-slate-200 text-xs rounded px-2.5 py-1.5 border border-white/[0.08] focus:border-[#5e6ad2] outline-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={!directInput.trim()}
              className="px-2.5 py-1.5 bg-[#5e6ad2] hover:bg-[#4d59c0] disabled:opacity-40 text-white rounded text-xs font-semibold"
            >
              <Send size={11} />
            </button>
          </form>
        )}
      </div>

      {/* Footer buttons */}
      <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onDirectDispatch(department)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] px-2 py-1 rounded transition-colors"
        >
          <Send size={11} />
          <span>Giao việc phòng ban</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenDetails(department)}
          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${theme.textClass} hover:text-white transition-colors`}
        >
          <span>{theme.actionLabel}</span>
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
};
