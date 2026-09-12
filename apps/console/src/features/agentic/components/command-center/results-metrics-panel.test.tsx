// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsMetricsPanel } from "./results-metrics-panel";

describe("ResultsMetricsPanel", () => {
  const defaultProps = {
    totalCompleted: 28,
    onTimePercent: 82,
    delayedPercent: 11,
    cancelledPercent: 7,
    departmentEfficiencies: [
      { department: "marketing" as const, displayName: "Marketing", efficiencyPercent: 92 },
      { department: "merchandising" as const, displayName: "Kinh doanh", efficiencyPercent: 78 },
      { department: "operations" as const, displayName: "Sản phẩm", efficiencyPercent: 65 },
      { department: "support" as const, displayName: "Tài chính", efficiencyPercent: 88 },
    ],
    activeTasksCount: 12,
    completedThisWeekCount: 28,
    completedTrendPercent: 27,
    avgDurationHours: 3.2,
    durationTrendPercent: -41,
    approvalRatePercent: 96,
    approvalRateTrendPercent: 12,
    recentDeliverables: [
      {
        id: "d1",
        title: "Báo cáo xu hướng thị trường mỹ phẩm SEA",
        departmentName: "Marketing",
        completedAt: "14:20",
        format: "docx",
        onDownloadOrView: vi.fn(),
      },
    ],
    onViewAllDeliverables: vi.fn(),
  };

  it("renders Donut chart metrics, department efficiency bars, 4 KPI cards, and recent outputs", () => {
    render(<ResultsMetricsPanel {...defaultProps} />);
    expect(screen.getByText("KẾT QUẢ HOÀN THÀNH")).toBeDefined();
    expect(screen.getAllByText("28").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Đúng hạn/)).toBeDefined();
    expect(screen.getByText("Marketing")).toBeDefined();
    expect(screen.getByText("92%")).toBeDefined();
    expect(screen.getByText("3.2h")).toBeDefined();
    expect(screen.getByText("Báo cáo xu hướng thị trường mỹ phẩm SEA")).toBeDefined();
  });
});
