// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StrategicDeliverableModal } from "./strategic-deliverable-modal";
import { buildStrategicDeliverable } from "../../types/strategic-deliverable.types";

describe("StrategicDeliverableModal", () => {
  const sampleDeliverable = buildStrategicDeliverable(
    "Phân tích thị trường mỹ phẩm Đông Nam Á và xây dựng kế hoạch ra mắt sản phẩm mới tại Việt Nam...",
    "task-test-123",
  );

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <StrategicDeliverableModal
        isOpen={false}
        deliverable={sampleDeliverable}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders deliverable title, goal, and metrics when isOpen is true", () => {
    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={sampleDeliverable}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Báo cáo Chiến lược: Phân tích Thị trường Mỹ phẩm/)).toBeDefined();
    expect(screen.getByText(/Chỉ đạo thực thi:/)).toBeDefined();
    expect(screen.getByText(/AI CEO & Điều phối Chiến lược/)).toBeDefined();
    expect(screen.getByText(/Hoàn tất 100%/)).toBeDefined();
    expect(screen.getByText("Tóm tắt Chiến lược Điều hành (Executive Summary)")).toBeDefined();
  });

  it("switches tabs between summary, insights, action plan, and risks", () => {
    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={sampleDeliverable}
        onClose={vi.fn()}
      />,
    );

    // Initial tab is summary
    expect(screen.getByText("Tóm tắt Chiến lược Điều hành (Executive Summary)")).toBeDefined();

    // Click Insights tab
    fireEvent.click(screen.getByText(/Dữ liệu & Thị trường/));
    expect(screen.getByText("Chỉ số Thị trường & Phân tích Cạnh tranh")).toBeDefined();
    expect(screen.getByText("Quy mô Thị trường ASEAN")).toBeDefined();
    expect(screen.getByText("12.8 Tỷ USD")).toBeDefined();

    // Click Action Plan tab
    fireEvent.click(screen.getByText(/Lộ trình Thực thi/));
    expect(screen.getByText("Lộ trình Hành động 3 Giai đoạn Ra mắt Thị trường")).toBeDefined();
    expect(screen.getByText(/Chuẩn hóa Pháp lý & Hoàn thiện Bộ nhận diện Thương hiệu/)).toBeDefined();

    // Click Risks tab
    fireEvent.click(screen.getByText(/Rủi ro & Pháp lý/));
    expect(screen.getByText("Ma trận Quản trị Rủi ro & Biện pháp Phòng ngừa")).toBeDefined();
    expect(screen.getByText(/Rào cản pháp lý & thời gian phê duyệt/)).toBeDefined();
  });

  it("calls onClose when the close button or footer close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={sampleDeliverable}
        onClose={onClose}
      />,
    );

    const closeButtons = screen.getAllByRole("button", { name: "Đóng" });
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onDownloadDocx when custom download callback is provided", () => {
    const onDownloadDocx = vi.fn();
    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={sampleDeliverable}
        onClose={vi.fn()}
        onDownloadDocx={onDownloadDocx}
      />,
    );

    fireEvent.click(screen.getByText("Tải Báo cáo (.docx)"));
    expect(onDownloadDocx).toHaveBeenCalled();
  });

  it("calls onNavigateToTask when DAG details button is clicked", () => {
    const onNavigateToTask = vi.fn();
    const onClose = vi.fn();
    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={sampleDeliverable}
        onClose={onClose}
        onNavigateToTask={onNavigateToTask}
      />,
    );

    fireEvent.click(screen.getByText("Chi tiết Vận hành DAG"));
    expect(onClose).toHaveBeenCalled();
    expect(onNavigateToTask).toHaveBeenCalledWith("task-test-123");
  });
});
