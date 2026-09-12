// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { Plus, ChevronDown, Sliders } from "lucide-react";
import type { CommandCenterHeaderProps, TaskFilterType } from "./types";

export const CommandCenterHeader: React.FC<CommandCenterHeaderProps> = ({
  activeFilter,
  counts,
  onFilterChange,
  onNewTaskClick,
  onDirectModeToggle,
  directInputMode = false,
}) => {
  const filterPills: { id: TaskFilterType; label: string; count: number; colorClass: string }[] = [
    { id: "all", label: "Tất cả", count: counts.all, colorClass: "text-slate-200 border-slate-700/60" },
    { id: "running", label: "Đang xử lý", count: counts.running, colorClass: "text-blue-400 border-blue-500/40" },
    { id: "waiting_approval", label: "Chờ phê duyệt", count: counts.waiting_approval, colorClass: "text-amber-400 border-amber-500/40" },
    { id: "completed", label: "Đã hoàn thành", count: counts.completed, colorClass: "text-emerald-400 border-emerald-500/40" },
    { id: "failed", label: "Lỗi", count: counts.failed, colorClass: "text-rose-400 border-rose-500/40" },
  ];

  return (
    <div className="flex flex-col gap-3 pb-2 pt-1 border-b border-white/[0.06] mb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Tasks
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Giao việc. AI vận hành. Kết quả thực.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {onDirectModeToggle && (
            <button
              type="button"
              onClick={onDirectModeToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                directInputMode
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : "bg-[#11131a] text-slate-300 border-white/[0.08] hover:bg-white/[0.04]"
              }`}
            >
              <Sliders size={13} />
              <span>Chế độ trực tiếp</span>
            </button>
          )}

          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#11131a] text-slate-300 border border-white/[0.08]">
            <span className="text-slate-500">Chế độ điều hành:</span>
            <span className="text-white font-semibold">CompanyOS AI</span>
            <ChevronDown size={13} className="text-slate-400 ml-0.5" />
          </div>

          <button
            type="button"
            onClick={onNewTaskClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#5e6ad2] text-white hover:bg-[#4d59c0] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/50"
          >
            <Plus size={14} />
            <span>+ Tác vụ mới</span>
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
        {filterPills.map((pill) => {
          const isActive = activeFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => onFilterChange(pill.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                isActive
                  ? "bg-white/[0.08] text-white border-white/20 shadow-sm"
                  : "bg-transparent text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/[0.03]"
              }`}
            >
              <span>{pill.label}</span>
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold border ${pill.colorClass} bg-[#0a0b10]`}
              >
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
