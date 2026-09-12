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
});
