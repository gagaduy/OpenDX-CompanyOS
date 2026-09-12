// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Zap,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  FileText,
  Download,
} from "lucide-react";
import type { ResultsMetricsProps } from "./types";

export const ResultsMetricsPanel: React.FC<ResultsMetricsProps> = ({
  totalCompleted,
  onTimePercent,
  delayedPercent,
  cancelledPercent,
  departmentEfficiencies,
  activeTasksCount,
  completedThisWeekCount,
  completedTrendPercent,
  avgDurationHours,
  durationTrendPercent,
  approvalRatePercent,
  approvalRateTrendPercent,
  recentDeliverables,
  onViewAllDeliverables,
}) => {
  // SVG Donut calculation
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const onTimeStroke = (onTimePercent / 100) * circumference;
  const delayedStroke = (delayedPercent / 100) * circumference;
  const cancelledStroke = (cancelledPercent / 100) * circumference;

  return (
    <div className="bg-[#0a0b10] border border-white/[0.08] rounded-xl p-4 mt-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
        <h2 className="text-xs font-bold text-white tracking-wider uppercase flex items-center gap-2">
          <BarChart3 size={15} className="text-[#5e6ad2]" />
          <span>KẾT QUẢ HOÀN THÀNH</span>
        </h2>

        <button
          type="button"
          onClick={onViewAllDeliverables}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <span>Xem tất cả kết quả</span>
          <ArrowRight size={12} />
        </button>
      </div>

      {/* 4 horizontal blocks grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 items-start">
        {/* Block 1 (3/12 cols): Donut Chart */}
        <div className="lg:col-span-3 flex items-center gap-4 bg-[#11131a] p-3.5 rounded-lg border border-white/[0.06]">
          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-white/[0.06]"
                strokeWidth="10"
                fill="transparent"
              />
              {/* On-time (green) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-emerald-500"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={`${onTimeStroke} ${circumference}`}
                strokeDashoffset="0"
                strokeLinecap="round"
              />
              {/* Delayed (amber) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-amber-500"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={`${delayedStroke} ${circumference}`}
                strokeDashoffset={-onTimeStroke}
              />
              {/* Cancelled (red) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-rose-500"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={`${cancelledStroke} ${circumference}`}
                strokeDashoffset={-(onTimeStroke + delayedStroke)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-bold text-white leading-none">{totalCompleted}</span>
              <span className="text-[9px] text-slate-400 mt-0.5">tác vụ</span>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-slate-300">Đúng hạn:</span>
              <span className="font-semibold text-white ml-auto">{onTimePercent}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-slate-300">Trễ hạn:</span>
              <span className="font-semibold text-white ml-auto">{delayedPercent}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-slate-300">Đã hủy:</span>
              <span className="font-semibold text-white ml-auto">{cancelledPercent}%</span>
            </div>
          </div>
        </div>

        {/* Block 2 (3/12 cols): Department Efficiency Bars */}
        <div className="lg:col-span-3 bg-[#11131a] p-3.5 rounded-lg border border-white/[0.06] space-y-2.5">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Hiệu suất theo phòng ban
          </h3>
          {departmentEfficiencies.map((d) => (
            <div key={d.department} className="text-xs">
              <div className="flex items-center justify-between mb-1 text-[11px]">
                <span className="text-slate-300 font-medium">{d.displayName}</span>
                <span className="font-semibold text-white font-mono">{d.efficiencyPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#5e6ad2]"
                  style={{ width: `${d.efficiencyPercent}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Block 3 (3/12 cols): 4 Key Metrics Mini-Cards */}
        <div className="lg:col-span-3 grid grid-cols-2 gap-2">
          {/* Active Tasks */}
          <div className="bg-[#11131a] p-2.5 rounded-lg border border-white/[0.06]">
            <div className="flex items-center gap-1 text-slate-400 text-[10px]">
              <Zap size={12} className="text-amber-400" />
              <span>Đang xử lý</span>
            </div>
            <p className="text-lg font-bold text-white mt-1 leading-none">{activeTasksCount}</p>
          </div>

          {/* Completed This Week */}
          <div className="bg-[#11131a] p-2.5 rounded-lg border border-white/[0.06]">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Hoàn thành</span>
              </span>
              <span className="text-emerald-400 font-semibold inline-flex items-center gap-0.5">
                <TrendingUp size={10} />
                <span>+{completedTrendPercent}%</span>
              </span>
            </div>
            <p className="text-lg font-bold text-white mt-1 leading-none">{completedThisWeekCount}</p>
          </div>

          {/* Avg Handling Time */}
          <div className="bg-[#11131a] p-2.5 rounded-lg border border-white/[0.06]">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} className="text-blue-400" />
                <span>Xử lý TB</span>
              </span>
              <span className="text-emerald-400 font-semibold inline-flex items-center gap-0.5">
                <TrendingDown size={10} />
                <span>{durationTrendPercent}%</span>
              </span>
            </div>
            <p className="text-lg font-bold text-white mt-1 leading-none">{avgDurationHours}h</p>
          </div>

          {/* Approval Rate */}
          <div className="bg-[#11131a] p-2.5 rounded-lg border border-white/[0.06]">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <BarChart3 size={12} className="text-purple-400" />
                <span>Tỷ lệ duyệt</span>
              </span>
              <span className="text-emerald-400 font-semibold inline-flex items-center gap-0.5">
                <TrendingUp size={10} />
                <span>+{approvalRateTrendPercent}%</span>
              </span>
            </div>
            <p className="text-lg font-bold text-white mt-1 leading-none">{approvalRatePercent}%</p>
          </div>
        </div>

        {/* Block 4 (3/12 cols): Recent Outputs List */}
        <div className="lg:col-span-3 bg-[#11131a] p-3.5 rounded-lg border border-white/[0.06] space-y-2">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Kết quả gần đây
          </h3>
          {recentDeliverables.slice(0, 3).map((item) => (
            <div
              key={item.id}
              onClick={item.onDownloadOrView}
              className="flex items-center justify-between p-1.5 rounded hover:bg-white/[0.04] cursor-pointer transition-colors text-xs group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={13} className="text-[#5e6ad2] shrink-0" />
                <div className="min-w-0">
                  <p className="text-slate-200 font-medium truncate text-[11px] leading-tight">
                    {item.title}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {item.departmentName} • {item.completedAt}
                  </p>
                </div>
              </div>
              <Download size={12} className="text-slate-400 group-hover:text-white shrink-0 ml-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
