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
    <div className="ccResultsPanel">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyItems: "space-between", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h2 className="ccResultsHeaderTitle" style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
          <BarChart3 size={15} style={{ color: "#3b82f6" }} />
          <span>KẾT QUẢ HOÀN THÀNH</span>
        </h2>

        <button
          type="button"
          onClick={onViewAllDeliverables}
          className="ccDeliverablesViewAll"
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <span>Xem tất cả kết quả</span>
          <ArrowRight size={12} />
        </button>
      </div>

      {/* 4 horizontal blocks card */}
      <div className="ccResultsCard">
        {/* Block 1: Donut Chart */}
        <div className="ccDonutCol">
          <div className="ccDonutWrapper">
            <svg style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }} viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="9"
                fill="transparent"
              />
              {/* On-time (green) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                stroke="#22c55e"
                strokeWidth="9"
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
                stroke="#f59e0b"
                strokeWidth="9"
                fill="transparent"
                strokeDasharray={`${delayedStroke} ${circumference}`}
                strokeDashoffset={-onTimeStroke}
              />
              {/* Cancelled (blue) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                stroke="#3b82f6"
                strokeWidth="9"
                fill="transparent"
                strokeDasharray={`${cancelledStroke} ${circumference}`}
                strokeDashoffset={-(onTimeStroke + delayedStroke)}
              />
            </svg>
            <div className="ccDonutCenterText">
              <span className="ccDonutNumber">{totalCompleted}</span>
              <span className="ccDonutLabel">tác vụ hoàn thành</span>
            </div>
          </div>

          <div className="ccDonutLegend">
            <div className="ccDonutLegendItem">
              <span className="ccLegendDot on-time" />
              <span>Đúng hạn:</span>
              <span style={{ fontWeight: 700, color: "#ffffff", marginLeft: "auto" }}>{onTimePercent}%</span>
            </div>
            <div className="ccDonutLegendItem">
              <span className="ccLegendDot delayed" style={{ background: "#f59e0b" }} />
              <span>Trễ hạn:</span>
              <span style={{ fontWeight: 700, color: "#ffffff", marginLeft: "auto" }}>{delayedPercent}%</span>
            </div>
            <div className="ccDonutLegendItem">
              <span className="ccLegendDot cancelled" />
              <span>Đã hủy:</span>
              <span style={{ fontWeight: 700, color: "#ffffff", marginLeft: "auto" }}>{cancelledPercent}%</span>
            </div>
          </div>
        </div>

        {/* Block 2: Department Efficiency Bars */}
        <div className="ccEfficiencyCol">
          <h3 className="ccColTitle">
            Hiệu suất theo phòng ban
          </h3>
          {departmentEfficiencies.map((d) => (
            <div key={d.department} className="ccEfficiencyRow">
              <div className="ccEffLabelRow">
                <span>{d.displayName}</span>
                <span style={{ fontWeight: 700, color: "#ffffff", fontFamily: "monospace" }}>{d.efficiencyPercent}%</span>
              </div>
              <div className="ccEffBarTrack">
                <div
                  className="ccEffBarFill"
                  style={{
                    width: `${d.efficiencyPercent}%`,
                    background: d.department === "marketing"
                      ? "linear-gradient(90deg, #3b82f6, #60a5fa)"
                      : d.department === "merchandising"
                      ? "linear-gradient(90deg, #06b6d4, #22d3ee)"
                      : d.department === "operations"
                      ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                      : "linear-gradient(90deg, #10b981, #34d399)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Block 3: 4 Key Metrics Mini-Cards */}
        <div className="ccKpiCol">
          <h3 className="ccColTitle">
            Chỉ số quan trọng
          </h3>
          <div className="ccKpiGrid">
            {/* Active Tasks */}
            <div className="ccKpiCard">
              <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#94a3b8", fontSize: "0.68rem" }}>
                <Zap size={12} style={{ color: "#f59e0b" }} />
                <span>Tác vụ đang xử lý</span>
              </div>
              <p className="ccKpiVal" style={{ marginTop: "4px" }}>{activeTasksCount}</p>
            </div>

            {/* Completed This Week */}
            <div className="ccKpiCard">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.68rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <CheckCircle2 size={12} style={{ color: "#22c55e" }} />
                  <span>Hoàn thành</span>
                </span>
                <span className="ccKpiTrend pos" style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <TrendingUp size={10} />
                  <span>+{completedTrendPercent}%</span>
                </span>
              </div>
              <p className="ccKpiVal" style={{ marginTop: "4px" }}>{completedThisWeekCount}</p>
            </div>

            {/* Avg Handling Time */}
            <div className="ccKpiCard">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.68rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <Clock size={12} style={{ color: "#38bdf8" }} />
                  <span>Xử lý TB</span>
                </span>
                <span className="ccKpiTrend neg" style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <TrendingDown size={10} />
                  <span>{durationTrendPercent}%</span>
                </span>
              </div>
              <p className="ccKpiVal" style={{ marginTop: "4px" }}>{avgDurationHours}h</p>
            </div>

            {/* Approval Rate */}
            <div className="ccKpiCard">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.68rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <BarChart3 size={12} style={{ color: "#c084fc" }} />
                  <span>Tỷ lệ duyệt</span>
                </span>
                <span className="ccKpiTrend pos" style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <TrendingUp size={10} />
                  <span>+{approvalRateTrendPercent}%</span>
                </span>
              </div>
              <p className="ccKpiVal" style={{ marginTop: "4px" }}>{approvalRatePercent}%</p>
            </div>
          </div>
        </div>

        {/* Block 4: Recent Outputs List */}
        <div className="ccDeliverablesCol">
          <div className="ccDeliverablesHeader">
            <h3 className="ccColTitle" style={{ margin: 0 }}>
              Kết quả gần đây
            </h3>
            <button
              type="button"
              onClick={onViewAllDeliverables}
              className="ccDeliverablesViewAll"
            >
              Xem tất cả →
            </button>
          </div>
          <div className="ccDeliverablesList">
            {recentDeliverables.length === 0 ? (
              <div style={{ padding: "1.5rem 0", textAlign: "center", fontSize: "0.75rem", color: "#64748b" }}>
                Chưa có tài liệu hoàn thành
              </div>
            ) : (
              recentDeliverables.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  onClick={item.onDownloadOrView}
                  className="ccDeliverableItem"
                  style={{ cursor: "pointer" }}
                >
                  <div className="ccDelivLeft">
                    <FileText size={13} style={{ color: "#60a5fa", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.title}
                    </span>
                  </div>
                  <div className="ccDelivRight">
                    <span className="ccDelivTime">{item.completedAt}</span>
                    <span className="ccDelivBadge">
                      Đã hoàn thành
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
