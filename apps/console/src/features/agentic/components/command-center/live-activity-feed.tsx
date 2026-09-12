// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Info,
  ChevronDown,
  Megaphone,
  ShoppingBag,
  Package,
  MessageSquare,
  Bot,
} from "lucide-react";
import type { LiveActivityFeedProps, LiveEventItem } from "./types";
import type { DepartmentType } from "../../types/department-task-queue.types";

const DEPT_ICONS: Record<DepartmentType | "ai_ceo", React.ElementType> = {
  ai_ceo: Bot,
  marketing: Megaphone,
  merchandising: ShoppingBag,
  operations: Package,
  support: MessageSquare,
};

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({
  events,
  activeDepartmentFilter,
  onFilterChange,
}) => {
  const filteredEvents = activeDepartmentFilter === "all"
    ? events
    : events.filter((e) => e.department === activeDepartmentFilter);

  return (
    <div className="bg-[#0a0b10] border border-white/[0.08] rounded-xl p-4 flex flex-col shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>Luồng công việc thời gian thực</span>
          </h3>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>

        <div className="relative">
          <select
            value={activeDepartmentFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="appearance-none bg-[#11131a] text-slate-300 text-[11px] border border-white/[0.06] rounded px-2.5 py-1 pr-6 hover:bg-white/[0.04] cursor-pointer outline-none font-medium"
          >
            <option value="all">Tất cả phòng ban</option>
            <option value="ai_ceo">AI CEO</option>
            <option value="marketing">Tiếp thị & Sáng tạo</option>
            <option value="merchandising">Danh mục & Định giá</option>
            <option value="operations">Vận hành & Kho vận</option>
            <option value="support">CSKH & Trải nghiệm</option>
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Events timeline list */}
      <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
        {filteredEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Chưa có sự kiện thời gian thực nào
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const DeptIcon = DEPT_ICONS[ev.department] || Bot;

            return (
              <div key={ev.id} className="flex items-start gap-2.5 text-xs group">
                <span className="font-mono text-[10px] text-slate-500 mt-0.5 shrink-0">
                  {ev.timestamp}
                </span>

                <div className="mt-0.5 shrink-0">
                  {ev.status === "error" ? (
                    <div className="w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                      <AlertTriangle size={11} />
                    </div>
                  ) : ev.status === "warning" ? (
                    <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Clock size={11} />
                    </div>
                  ) : ev.status === "success" ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 size={11} />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <DeptIcon size={11} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-medium text-slate-200 truncate">
                      {ev.title}
                    </p>
                    {ev.actionLabel && ev.onActionClick && (
                      <button
                        type="button"
                        onClick={ev.onActionClick}
                        className="shrink-0 text-[10px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/20 transition-colors"
                      >
                        {ev.actionLabel}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {ev.description}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
