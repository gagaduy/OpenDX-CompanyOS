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

  it("triggers onSubmit when Giao việc is clicked", () => {
    render(<CommandComposerPanel {...defaultProps} prompt="Launch new campaign" />);
    fireEvent.click(screen.getByText("Giao việc"));
    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
  });
});
