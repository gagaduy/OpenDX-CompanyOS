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
    <div className="ccLiveFeedCard">
      {/* Header */}
      <div className="ccLiveFeedHeader">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <h3 className="ccLiveFeedTitle">
            <span>Luồng công việc thời gian thực</span>
          </h3>
          <span className="ccLivePulseBadge">
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} className="animate-pulse" />
            Live
          </span>
        </div>

        <div style={{ position: "relative" }}>
          <select
            value={activeDepartmentFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="ccLiveDeptSelect"
            style={{ paddingRight: "18px", appearance: "none" }}
          >
            <option value="all">Tất cả phòng ban</option>
            <option value="ai_ceo">AI CEO</option>
            <option value="marketing">Tiếp thị & Sáng tạo</option>
            <option value="merchandising">Danh mục & Định giá</option>
            <option value="operations">Vận hành & Kho vận</option>
            <option value="support">CSKH & Trải nghiệm</option>
          </select>
          <ChevronDown size={10} style={{ position: "absolute", right: "5px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b" }} />
        </div>
      </div>

      {/* Events timeline list */}
      <div className="ccTimeline" style={{ maxHeight: "280px", overflowY: "auto" }}>
        {filteredEvents.length === 0 ? (
          <div style={{ padding: "2rem 0", textAlign: "center", fontSize: "0.75rem", color: "#64748b" }}>
            Chưa có sự kiện thời gian thực nào
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const DeptIcon = DEPT_ICONS[ev.department] || Bot;

            const isClickable = Boolean(ev.onActionClick);
            return (
              <div
                key={ev.id}
                className="ccTimelineItem"
                onClick={ev.onActionClick}
                style={isClickable ? { cursor: "pointer" } : undefined}
                title={ev.actionLabel ? `${ev.actionLabel}: ${ev.title}` : undefined}
              >
                <span className="ccTimelineTime">
                  <span className="ccTimelineTimeHour">
                    {ev.time || (ev.timestamp.includes(" ") ? ev.timestamp.split(" ")[0] : ev.timestamp)}
                  </span>
                  {(ev.date || (ev.timestamp.includes(" ") ? ev.timestamp.split(" ")[1] : "")) ? (
                    <span className="ccTimelineTimeDate">
                      {ev.date || (ev.timestamp.includes(" ") ? ev.timestamp.split(" ")[1] : "")}
                    </span>
                  ) : null}
                </span>

                <div className={`ccTimelineNode status-${ev.status}`}>
                  {ev.status === "error" ? (
                    <AlertTriangle size={10} />
                  ) : ev.status === "warning" ? (
                    <Clock size={10} />
                  ) : ev.status === "success" ? (
                    <CheckCircle2 size={10} />
                  ) : (
                    <DeptIcon size={10} />
                  )}
                </div>

                <div className="ccTimelineContent">
                  <div className="ccTimelineTitleRow">
                    <span className="ccTimelineTitle">
                      {ev.title}
                    </span>
                    {ev.actionLabel && ev.onActionClick && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          ev.onActionClick?.();
                        }}
                        className={`ccTimelineActionBtn ${
                          ev.status === "success"
                            ? "action-success"
                            : ev.status === "warning"
                            ? "action-warning"
                            : "action-error"
                        }`}
                      >
                        {ev.actionLabel}
                      </button>
                    )}
                  </div>
                  <p className="ccTimelineDesc">
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
