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
  const filterPills: { id: TaskFilterType; label: string; count: number; badgeClass: string }[] = [
    { id: "all", label: "Tất cả", count: counts.all, badgeClass: "badge-all" },
    { id: "running", label: "Đang xử lý", count: counts.running, badgeClass: "badge-running" },
    { id: "waiting_approval", label: "Chờ phê duyệt", count: counts.waiting_approval, badgeClass: "badge-waiting" },
    { id: "completed", label: "Đã hoàn thành", count: counts.completed, badgeClass: "badge-completed" },
    { id: "failed", label: "Lỗi", count: counts.failed, badgeClass: "badge-failed" },
  ];

  return (
    <div className="ccHeaderContainer">
      <div className="ccHeaderTop">
        <div className="ccTitleBlock">
          <h1 className="ccTitle">Tasks</h1>
          <p className="ccSubtitle">Giao việc. AI vận hành. Kết quả thực.</p>
        </div>

        <div className="ccHeaderActions">
          {onDirectModeToggle && (
            <button
              type="button"
              onClick={onDirectModeToggle}
              className={`ccDirectModeBtn ${directInputMode ? "active" : ""}`}
            >
              <Sliders size={13} />
              <span>Chế độ trực tiếp</span>
            </button>
          )}

          <div className="ccOperatingModeBtn">
            <span className="ccOperatingModeLabel">Chế độ điều hành:</span>
            <span className="ccOperatingModeValue">CompanyOS AI</span>
            <ChevronDown size={13} style={{ color: "#94a3b8", marginLeft: "2px" }} />
          </div>

          <button
            type="button"
            onClick={onNewTaskClick}
            className="ccNewTaskBtn"
          >
            <Plus size={14} />
            <span>Tác vụ mới</span>
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="ccFilterPillsRow">
        {filterPills.map((pill) => {
          const isActive = activeFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => onFilterChange(pill.id)}
              className={`ccFilterPill ${pill.id} ${isActive ? "active" : ""}`}
            >
              <span>{pill.label}</span>
              <span className={`ccFilterPillBadge ${pill.badgeClass}`}>
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
