// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DepartmentDiagnosticsModal } from "./department-diagnostics-modal";

describe("DepartmentDiagnosticsModal", () => {
  const defaultProps = {
    isOpen: true,
    department: "operations" as const,
    departmentName: "Phòng Vận hành & Kho vận",
    errorMessage: "Lỗi cảnh báo: Mức tồn kho khả dụng dưới ngưỡng an toàn SKU-TECH-01",
    timestamp: Date.now(),
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onOpenAuditLogs: vi.fn(),
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <DepartmentDiagnosticsModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders diagnostics report, error details, and root cause analysis", () => {
    render(<DepartmentDiagnosticsModal {...defaultProps} />);
    expect(screen.getByText("Báo cáo Chẩn đoán Lỗi Vận hành")).toBeDefined();
    expect(screen.getByText(/Phòng Vận hành & Kho vận/)).toBeDefined();
    expect(screen.getByText(/Mức tồn kho khả dụng dưới ngưỡng an toàn SKU-TECH-01/)).toBeDefined();
    expect(screen.getByText(/Phân tích nguyên nhân/)).toBeDefined();
    expect(screen.getByText("Khuyến nghị xử lý & Khắc phục")).toBeDefined();
  });

  it("triggers onRetry and onClose when Thử lại tác vụ is clicked", () => {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(
      <DepartmentDiagnosticsModal
        {...defaultProps}
        onRetry={onRetry}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("Thử lại tác vụ"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers onOpenAuditLogs and onClose when Xem Nhật ký Kiểm toán is clicked", () => {
    const onOpenAuditLogs = vi.fn();
    const onClose = vi.fn();
    render(
      <DepartmentDiagnosticsModal
        {...defaultProps}
        onOpenAuditLogs={onOpenAuditLogs}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("Xem Nhật ký Kiểm toán"));
    expect(onOpenAuditLogs).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders special action button if provided", () => {
    const onSpecialAction = vi.fn();
    render(
      <DepartmentDiagnosticsModal
        {...defaultProps}
        specialActionLabel="Mở Quản lý Social Tokens"
        onSpecialAction={onSpecialAction}
      />
    );
    fireEvent.click(screen.getByText("Mở Quản lý Social Tokens"));
    expect(onSpecialAction).toHaveBeenCalledTimes(1);
  });
});
