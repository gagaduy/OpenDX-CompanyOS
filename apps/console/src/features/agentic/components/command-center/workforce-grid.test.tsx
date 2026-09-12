// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkforceGrid } from "./workforce-grid";
import type { DepartmentCardProps } from "./types";

describe("WorkforceGrid", () => {
  const departments: DepartmentCardProps[] = [
    {
      department: "marketing",
      displayName: "Tiếp thị & Sáng tạo",
      employeeCount: 3,
      activeTaskCount: 2,
      status: "running",
      employees: [
        { id: "m1", name: "MKT-01", role: "Cây bút Tiếp thị", status: "working", progressPercent: 75 },
        { id: "m2", name: "MKT-02", role: "Thiết kế Đồ họa", status: "working", progressPercent: 40 },
        { id: "m3", name: "MKT-03", role: "Điều phối Xuất bản", status: "waiting", progressPercent: 0 },
      ],
      queue: [
        { id: "q1", department: "marketing", prompt: "Phân tích đối thủ", requiredAgents: [], status: "queued", queuedAt: Date.now() },
        { id: "q2", department: "marketing", prompt: "Lên ý tưởng chiến dịch", requiredAgents: [], status: "queued", queuedAt: Date.now() },
      ],
      tokenAlert: { status: "healthy", label: "Social Token: OK" },
      onDirectDispatch: vi.fn(),
      onOpenDetails: vi.fn(),
    },
    {
      department: "operations",
      displayName: "Vận hành & Kho vận",
      employeeCount: 2,
      activeTaskCount: 1,
      status: "error",
      errorMessage: "Lỗi: Không tìm thấy dữ liệu tồn kho an toàn SKU-TECH-01",
      employees: [
        { id: "o1", name: "OPS-01", role: "Kỹ sư Tồn kho", status: "failed", progressPercent: 0 },
        { id: "o2", name: "OPS-02", role: "Điều phối Đơn hàng", status: "working", progressPercent: 30 },
      ],
      queue: [{ id: "q3", department: "operations", prompt: "Lập dự thảo PO", requiredAgents: [], status: "queued", queuedAt: Date.now() }],
      onDirectDispatch: vi.fn(),
      onOpenDetails: vi.fn(),
      onErrorResolve: vi.fn(),
    },
  ];

  it("renders 2x2 grid header, department cards, and digital employee rows", () => {
    render(<WorkforceGrid departments={departments} onViewDagGraph={vi.fn()} />);
    expect(screen.getByText("Phân công & Điều phối nhân sự AI theo phòng ban")).toBeDefined();
    expect(screen.getByText("Tiếp thị & Sáng tạo")).toBeDefined();
    expect(screen.getByText("Vận hành & Kho vận")).toBeDefined();
    expect(screen.getByText("MKT-01")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("renders exception alert when department has errorMessage", () => {
    render(<WorkforceGrid departments={departments} onViewDagGraph={vi.fn()} />);
    expect(screen.getByText(/Không tìm thấy dữ liệu tồn kho an toàn/)).toBeDefined();
    expect(screen.getByText("Xem chi tiết →")).toBeDefined();
  });

  it("triggers onViewDagGraph when link is clicked", () => {
    const onViewDag = vi.fn();
    render(<WorkforceGrid departments={departments} onViewDagGraph={onViewDag} />);
    fireEvent.click(screen.getByText("Xem sơ đồ quy trình"));
    expect(onViewDag).toHaveBeenCalledTimes(1);
  });

  it("renders onOpenDetails action and calls callback on click", () => {
    const onOpen = vi.fn();
    const deptsWithHandler: DepartmentCardProps[] = [
      {
        ...departments[0],
        onOpenDetails: onOpen,
      },
    ];
    render(<WorkforceGrid departments={deptsWithHandler} onViewDagGraph={vi.fn()} />);
    expect(screen.getByText("Xem chiến dịch")).toBeDefined();
    fireEvent.click(screen.getByText("Xem chiến dịch"));
    expect(onOpen).toHaveBeenCalledWith("marketing");
  });

  it("triggers onErrorResolve when Xem chi tiết → is clicked", () => {
    const onResolve = vi.fn();
    const deptsWithError: DepartmentCardProps[] = [
      {
        ...departments[1],
        onErrorResolve: onResolve,
      },
    ];
    render(<WorkforceGrid departments={deptsWithError} onViewDagGraph={vi.fn()} />);
    fireEvent.click(screen.getByText("Xem chi tiết →"));
    expect(onResolve).toHaveBeenCalledWith("operations");
  });
});
