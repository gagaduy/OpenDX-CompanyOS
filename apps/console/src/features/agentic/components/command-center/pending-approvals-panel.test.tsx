// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PendingApprovalsPanel } from "./pending-approvals-panel";
import type { PendingApprovalItem } from "./types";

describe("PendingApprovalsPanel", () => {
  const onPreview = vi.fn();
  const onRequestRevision = vi.fn();
  const onApprove = vi.fn();
  const onReject = vi.fn();

  const approvals: PendingApprovalItem[] = [
    {
      id: "app-1",
      title: "Báo cáo phân tích thị trường SEA",
      sourceDepartment: "marketing",
      authorName: "Marketing (MKT-01)",
      riskLevel: "medium",
      timestamp: "14:26",
      onPreview,
      onRequestRevision,
      onApprove,
      onReject,
    },
  ];

  it("renders pending approval card with Human-in-the-Loop action buttons including Hủy duyệt", () => {
    render(<PendingApprovalsPanel approvals={approvals} onViewAll={vi.fn()} />);
    expect(screen.getAllByText(/Phê duyệt/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Báo cáo phân tích thị trường SEA")).toBeDefined();
    expect(screen.getByText("Xem trước")).toBeDefined();
    expect(screen.getByText("Yêu cầu chỉnh sửa")).toBeDefined();
    expect(screen.getByText("Hủy duyệt")).toBeDefined();
    expect(screen.getByRole("button", { name: /Phê duyệt/ })).toBeDefined();
  });

  it("triggers onPreview, onApprove, and onReject callbacks", () => {
    render(<PendingApprovalsPanel approvals={approvals} onViewAll={vi.fn()} />);
    fireEvent.click(screen.getByText("Xem trước"));
    expect(onPreview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Hủy duyệt"));
    expect(onReject).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Phê duyệt/ }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("renders approvals inside a scrollable container", () => {
    const { container } = render(<PendingApprovalsPanel approvals={approvals} onViewAll={vi.fn()} />);
    const scrollContainer = container.querySelector(".ccApprovalsScrollContainer");
    expect(scrollContainer).toBeDefined();
    expect(scrollContainer?.children.length).toBe(1);
  });

  it("applies custom maxHeight style when maxHeight prop is provided", () => {
    const { container } = render(<PendingApprovalsPanel approvals={approvals} onViewAll={vi.fn()} maxHeight={430} />);
    const scrollContainer = container.querySelector(".ccApprovalsScrollContainer") as HTMLElement;
    expect(scrollContainer?.style.maxHeight).toBe("430px");
  });
});
