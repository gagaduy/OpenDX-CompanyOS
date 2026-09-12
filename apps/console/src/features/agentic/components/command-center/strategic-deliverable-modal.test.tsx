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

  it("builds and renders Nova Tech campaign deliverable with rich tech market data", () => {
    const techDeliverable = buildStrategicDeliverable(
      "Chiến dịch: Nova Tech - Khai Phá Tương Lai",
      "camp-nova-123",
      "merchandising",
    );

    expect(techDeliverable.department).toBe("merchandising");
    expect(techDeliverable.departmentName).toBe("Phòng Kinh doanh & Định giá Danh mục");
    expect(techDeliverable.title).toContain("Nova Tech");
    expect(techDeliverable.docxFilename).toBe("Bao_cao_Chien_luoc_Nova_Tech_Khai_Pha_Tuong_Lai.docx");

    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={techDeliverable}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Chiến dịch Nova Tech - Khai Phá Tương Lai/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Phòng Kinh doanh & Định giá Danh mục")).toBeDefined();
  });

  it("builds and renders Operations & Supply Chain deliverable with inventory metrics", () => {
    const opsDeliverable = buildStrategicDeliverable(
      "Kiểm tra tồn kho an toàn các mặt hàng bán chạy và lập đề xuất nhập kho",
      "ops-123",
      "operations",
    );

    expect(opsDeliverable.department).toBe("operations");
    expect(opsDeliverable.departmentName).toBe("Phòng Chuỗi cung ứng & Kho vận");
    expect(opsDeliverable.title).toContain("Báo cáo Vận hành & Chuỗi cung ứng");
    expect(opsDeliverable.docxFilename).toBe("Bao_cao_Van_hanh_Ton_kho_An_toan.docx");

    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={opsDeliverable}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Phòng Chuỗi cung ứng & Kho vận")).toBeDefined();
    expect(screen.getByText("Tóm tắt Chiến lược Điều hành (Executive Summary)")).toBeDefined();

    fireEvent.click(screen.getByText(/Dữ liệu & Thị trường/));
    expect(screen.getByText("Tỷ lệ Sẵn sàng Hàng hóa (Fill Rate)")).toBeDefined();
    expect(screen.getByText("98.2%")).toBeDefined();
  });

  it("builds and renders Support & Customer Experience deliverable with CSAT metrics", () => {
    const supDeliverable = buildStrategicDeliverable(
      "Phân tích ticket khiếu nại khách hàng, giảm tỷ lệ churn và đề xuất voucher tri ân",
      "sup-123",
      "support",
    );

    expect(supDeliverable.department).toBe("support");
    expect(supDeliverable.departmentName).toBe("Phòng CSKH & Trải nghiệm Khách hàng");
    expect(supDeliverable.title).toContain("Báo cáo CSKH & Trải nghiệm Khách hàng");
    expect(supDeliverable.docxFilename).toBe("Bao_cao_CSKH_Va_Giu_chan_Khach_hang.docx");

    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={supDeliverable}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Phòng CSKH & Trải nghiệm Khách hàng")).toBeDefined();

    fireEvent.click(screen.getByText(/Dữ liệu & Thị trường/));
    expect(screen.getByText("Điểm Hài lòng Khách hàng (CSAT)")).toBeDefined();
    expect(screen.getByText("94.8%")).toBeDefined();
  });

  it("builds and renders Marketing deliverable with multi-channel reach metrics", () => {
    const mktDeliverable = buildStrategicDeliverable(
      "Chiến dịch truyền thông ra mắt sản phẩm mới trên Fanpage Facebook và TikTok",
      "mkt-123",
      "marketing",
    );

    expect(mktDeliverable.department).toBe("marketing");
    expect(mktDeliverable.departmentName).toBe("Phòng Tiếp thị & Truyền thông Sáng tạo");
    expect(mktDeliverable.title).toContain("Báo cáo Tiếp thị & Truyền thông");
    expect(mktDeliverable.docxFilename).toBe("Bao_cao_Tiep_thi_Va_Truyen_thong_Da_kenh.docx");

    render(
      <StrategicDeliverableModal
        isOpen={true}
        deliverable={mktDeliverable}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Phòng Tiếp thị & Truyền thông Sáng tạo")).toBeDefined();

    fireEvent.click(screen.getByText(/Dữ liệu & Thị trường/));
    expect(screen.getByText("Lượt Tiếp cận Dự kiến (Reach)")).toBeDefined();
    expect(screen.getByText("285,000 Lượt")).toBeDefined();
  });
});

