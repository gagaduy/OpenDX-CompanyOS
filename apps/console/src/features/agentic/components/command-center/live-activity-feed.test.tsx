// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LiveActivityFeed } from "./live-activity-feed";
import type { LiveEventItem } from "./types";

describe("LiveActivityFeed", () => {
  const onActionClick = vi.fn();
  const events: LiveEventItem[] = [
    {
      id: "ev-1",
      timestamp: "14:26",
      department: "ai_ceo",
      title: "AI CEO đã phân tích yêu cầu",
      description: "Đã tạo kế hoạch và phân bổ cho 4 phòng ban",
      status: "success",
    },
    {
      id: "ev-2",
      timestamp: "14:27",
      department: "operations",
      title: "Vận hành báo lỗi",
      description: "Không tìm thấy dữ liệu thị trường phù hợp",
      status: "error",
      actionLabel: "Cần xử lý",
      onActionClick,
    },
  ];

  it("renders live badge, events with timestamp, and description", () => {
    render(
      <LiveActivityFeed
        events={events}
        activeDepartmentFilter="all"
        onFilterChange={vi.fn()}
      />
    );
    expect(screen.getByText("Luồng công việc thời gian thực")).toBeDefined();
    expect(screen.getByText("Live")).toBeDefined();
    expect(screen.getByText("14:26")).toBeDefined();
    expect(screen.getByText("AI CEO đã phân tích yêu cầu")).toBeDefined();
    expect(screen.getByText("Cần xử lý")).toBeDefined();
  });

  it("calls onActionClick when action button is clicked", () => {
    render(
      <LiveActivityFeed
        events={events}
        activeDepartmentFilter="all"
        onFilterChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Cần xử lý"));
    expect(onActionClick).toHaveBeenCalledTimes(1);
  });
});
