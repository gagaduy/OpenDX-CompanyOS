// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandComposerPanel } from "./command-composer-panel";

describe("CommandComposerPanel", () => {
  const defaultProps = {
    prompt: "",
    onPromptChange: vi.fn(),
    onSubmit: vi.fn(),
    isSubmitting: false,
    isAnalyzing: true,
    analysisStep: 3,
    analysisDurationSeconds: 28,
    priority: "normal" as const,
    onPriorityChange: vi.fn(),
    targetDepartment: "ai_ceo",
    onTargetDepartmentChange: vi.fn(),
    onSelectTemplate: vi.fn(),
  };

  it("renders composer textarea, submit button, and quick action chips", () => {
    render(<CommandComposerPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText(/Ví dụ: Phân tích thị trường mỹ phẩm/)).toBeDefined();
    expect(screen.getByText("Giao việc")).toBeDefined();
    expect(screen.getByText("Phân tích thị trường")).toBeDefined();
    expect(screen.getByText("Ra mắt sản phẩm")).toBeDefined();
  });

  it("renders AI CEO Stepper card with current step and elapsed timer", () => {
    render(<CommandComposerPanel {...defaultProps} />);
    expect(screen.getByText("AI CEO")).toBeDefined();
    expect(screen.getByText("Đang phân tích...")).toBeDefined();
    expect(screen.getByText("00:00:28")).toBeDefined();
    expect(screen.getByText("Lựa chọn phòng ban phù hợp")).toBeDefined();
  });

  it("renders AI CEO Stepper card in standby idle state when not analyzing", () => {
    render(
      <CommandComposerPanel
        {...defaultProps}
        isAnalyzing={false}
        analysisStep={0}
        analysisDurationSeconds={0}
      />
    );
    expect(screen.getByText("AI CEO")).toBeDefined();
    expect(screen.getByText("Sẵn sàng")).toBeDefined();
    expect(screen.getByText("00:00:00")).toBeDefined();
    expect(
      screen.getByText(/Hệ thống AI CEO sẵn sàng tiếp nhận mục tiêu/i)
    ).toBeDefined();
  });

  it("triggers onSubmit when Giao việc is clicked", () => {
    render(<CommandComposerPanel {...defaultProps} prompt="Launch new campaign" />);
    fireEvent.click(screen.getByText("Giao việc"));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({
      prompt: "Launch new campaign",
      context: undefined,
      goalTarget: undefined,
      attachments: undefined,
      priority: "normal",
      target: "ai_ceo",
    });
  });

  it("renders 'Dừng lại' button when isSubmitting is true and triggers onStop when clicked", () => {
    const onStop = vi.fn();
    render(<CommandComposerPanel {...defaultProps} isSubmitting={true} onStop={onStop} />);
    expect(screen.getByText("Dừng lại")).toBeDefined();
    expect(screen.queryByText("Giao việc")).toBeNull();
    fireEvent.click(screen.getByText("Dừng lại"));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("handles file attachments and includes them in submit meta", () => {
    render(<CommandComposerPanel {...defaultProps} prompt="Phân tích báo cáo" />);
    const fileInput = screen.getByTestId("cc-file-input");
    const fakeFile = new File(["test data content"], "bao_cao_q3.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    expect(screen.getByText("bao_cao_q3.pdf")).toBeDefined();
    expect(screen.getByText(/Đính kèm \(1\)/)).toBeDefined();

    fireEvent.click(screen.getByText("Giao việc"));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Phân tích báo cáo",
        attachments: [{ name: "bao_cao_q3.pdf", size: fakeFile.size }],
      })
    );
  });

  it("handles business context and KPI goal target inputs", () => {
    render(<CommandComposerPanel {...defaultProps} prompt="Chiến dịch mới" />);

    // Open context input
    fireEvent.click(screen.getByText("Bối cảnh"));
    const contextInput = screen.getByPlaceholderText("Nhập ghi chú bối cảnh kinh doanh...");
    fireEvent.change(contextInput, { target: { value: "Thị trường cạnh tranh cao" } });

    // Open goal input
    fireEvent.click(screen.getByText("Mục tiêu"));
    const goalInput = screen.getByPlaceholderText(/VD: Tăng 20% doanh thu/);
    fireEvent.change(goalInput, { target: { value: "Đạt 10,000 đơn hàng" } });

    // Verify indicator badges
    expect(screen.getByText("Bối cảnh ✓")).toBeDefined();
    expect(screen.getByText("Mục tiêu ✓")).toBeDefined();

    fireEvent.click(screen.getByText("Giao việc"));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Chiến dịch mới",
        context: "Thị trường cạnh tranh cao",
        goalTarget: "Đạt 10,000 đơn hàng",
      })
    );
  });

  it("handles priority and department select changes", () => {
    render(<CommandComposerPanel {...defaultProps} />);

    const prioritySelect = screen.getByDisplayValue("Độ ưu tiên: Vừa");
    fireEvent.change(prioritySelect, { target: { value: "urgent" } });
    expect(defaultProps.onPriorityChange).toHaveBeenCalledWith("urgent");

    const deptSelect = screen.getByDisplayValue("NovaAI CEO");
    fireEvent.change(deptSelect, { target: { value: "marketing" } });
    expect(defaultProps.onTargetDepartmentChange).toHaveBeenCalledWith("marketing");
  });

  it("handles quick suggestion chip click", () => {
    render(<CommandComposerPanel {...defaultProps} />);
    fireEvent.click(screen.getByText("Tối ưu tồn kho"));

    expect(defaultProps.onPromptChange).toHaveBeenCalledWith(
      expect.stringContaining("Rà soát toàn bộ tồn kho")
    );
    expect(defaultProps.onTargetDepartmentChange).toHaveBeenCalledWith("operations");
    expect(defaultProps.onPriorityChange).toHaveBeenCalledWith("high");
    expect(defaultProps.onSelectTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "inv-opt",
        target: "operations",
      })
    );
  });

  it("renders active CeoPlan with target department badge, live step statuses, and action buttons", () => {
    const handleReset = vi.fn();
    const handleView = vi.fn();
    const mockCeoPlan = {
      goal: "Chiến dịch Marketing Fanpage Khuyến mãi Mùa hè",
      targetDept: "Phòng Tiếp thị & Truyền thông Sáng tạo",
      steps: [
        { role: "Cây bút Sáng tạo", task: "Soạn nội dung bài viết", status: "done" as const },
        { role: "Thiết kế Đồ họa", task: "Dựng poster 1:1 chuẩn Fanpage", status: "running" as const },
        { role: "Điều phối Xuất bản", task: "Đóng gói Publication Package", status: "pending" as const },
      ],
    };

    render(
      <CommandComposerPanel
        {...defaultProps}
        ceoPlan={mockCeoPlan}
        onResetCeoPlan={handleReset}
        onViewDeliverable={handleView}
      />
    );

    expect(screen.getByText("Phòng Tiếp thị & Truyền thông Sáng tạo")).toBeDefined();
    expect(screen.getByText("Đang thực thi...")).toBeDefined();
    expect(screen.getByText("Cây bút Sáng tạo")).toBeDefined();
    expect(screen.getByText("Xong")).toBeDefined();
    expect(screen.getByText("Thiết kế Đồ họa")).toBeDefined();
    expect(screen.getByText("Đang chạy")).toBeDefined();
    expect(screen.getByText("Chờ")).toBeDefined();

    // Click view deliverable and reset
    fireEvent.click(screen.getByText("Xem kết quả"));
    expect(handleView).toHaveBeenCalled();

    fireEvent.click(screen.getByText("+ Giao việc mới"));
    expect(handleReset).toHaveBeenCalled();
  });

  it("renders completed CeoPlan with 'Đã hoàn thành' status badge and completion quote", () => {
    const mockCompletedPlan = {
      goal: "Kiểm toán kho hàng Q3",
      targetDept: "Phòng Vận hành & Kho vận",
      steps: [
        { role: "Kỹ sư Tồn kho", task: "Kiểm kê SKU", status: "done" as const },
        { role: "Điều phối Đơn hàng", task: "Lập báo cáo Word", status: "done" as const },
      ],
    };

    render(
      <CommandComposerPanel
        {...defaultProps}
        ceoPlan={mockCompletedPlan}
      />
    );

    expect(screen.getByText("Đã hoàn thành")).toBeDefined();
    expect(screen.getByText(/AI CEO đã hoàn tất điều phối tác vụ cho Phòng Vận hành & Kho vận/i)).toBeDefined();
  });

  it("renders dynamic intent intake preview when typing prompt in standby mode", () => {
    render(
      <CommandComposerPanel
        {...defaultProps}
        prompt="Kế hoạch giảm giá 20% xả hàng tồn kho"
        isAnalyzing={false}
        analysisStep={0}
      />
    );

    expect(screen.getByText("Đang tiếp nhận...")).toBeDefined();
    expect(screen.getByText(/Đang tiếp nhận chỉ đạo chiến lược/i)).toBeDefined();
  });
});
