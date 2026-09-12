// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandCenterHeader } from "./command-center-header";

describe("CommandCenterHeader", () => {
  const defaultProps = {
    activeFilter: "all" as const,
    counts: { all: 12, running: 5, waiting_approval: 3, completed: 28, failed: 1 },
    onFilterChange: vi.fn(),
    onNewTaskClick: vi.fn(),
  };

  it("renders page title, subtitle, and filter badges with live counts", () => {
    render(<CommandCenterHeader {...defaultProps} />);
    expect(screen.getByText("Tasks")).toBeDefined();
    expect(screen.getByText("Giao việc. AI vận hành. Kết quả thực.")).toBeDefined();
    expect(screen.getByText("Tất cả")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText("Đang xử lý")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("Chờ phê duyệt")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("Đã hoàn thành")).toBeDefined();
    expect(screen.getByText("28")).toBeDefined();
    expect(screen.getByText("Lỗi")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
  });

  it("calls onFilterChange when a pill is clicked", () => {
    render(<CommandCenterHeader {...defaultProps} />);
    fireEvent.click(screen.getByText("Chờ phê duyệt"));
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith("waiting_approval");
  });

  it("calls onNewTaskClick when Tác vụ mới is clicked", () => {
    render(<CommandCenterHeader {...defaultProps} />);
    fireEvent.click(screen.getByText("Tác vụ mới"));
    expect(defaultProps.onNewTaskClick).toHaveBeenCalledTimes(1);
  });
});
