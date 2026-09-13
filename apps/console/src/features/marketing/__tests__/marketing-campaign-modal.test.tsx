// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketingCampaignModal } from "../components/marketing-campaign-modal";
import type { MarketingCampaignDetail } from "../types";

const sampleDetail: MarketingCampaignDetail = {
  campaign: {
    id: "camp-001",
    state: "awaiting_human_approval",
    assignmentMode: "direct_department",
    createdBy: "user-1",
    idempotencyKey: "idem-1",
    version: 1,
    campaignName: "Chiến dịch: Quảng bá iPhone 15 Pro Max",
    createdAt: "2026-09-13T00:00:00Z",
    updatedAt: "2026-09-13T00:05:00Z",
  },
  brief: {
    id: "brief-001",
    campaignId: "camp-001",
    campaignName: "Quảng bá iPhone 15 Pro Max",
    objective: "Soạn bài viết và thiết kế poster quảng bá sản phẩm iPhone 15 Pro Max",
    subjectKind: "catalog_product",
    subjectReference: "iphone-15-pro-max",
    language: "vi",
    mandatoryMessage: "Khám phá ngay tại NovaCommerce",
    prohibitedClaims: ["sản phẩm duy nhất vũ trụ"],
    callToAction: "Khám phá ngay",
    facebookPageConfigurationId: "fb-cfg-01",
    audience: "Đại chúng",
    tone: "Hào hứng",
    scheduledFor: "2026-09-13T01:00:00Z",
    deadline: "2026-09-14T00:00:00Z",
    approverId: "user-approver-1",
    maximumCostMicros: 500000,
    provenance: [],
    version: 1,
    createdAt: "2026-09-13T00:00:00Z",
  },
  contentVersions: [
    {
      id: "cv-001",
      campaignId: "camp-001",
      versionNumber: 1,
      hook: "🚀 iPhone 15 Pro Max: Khám phá sức mạnh vô song!",
      headline: "🚀 iPhone 15 Pro Max: Đỉnh cao công nghệ Titanium!",
      body: "Thiết kế đột phá với khung Titanium siêu bền, chip A17 Pro và cụm camera điện ảnh.",
      callToAction: "Khám phá ngay tại NovaCommerce",
      hashtags: ["#iPhone15ProMax", "#NovaCommerce", "#KhamPhaNgay"],
      visualDirection: "Ảnh chụp studio vuông 1:1 góc nghiêng 45 độ",
      factualClaimSourceIds: [],
      contentDigest: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      costMicros: 1500,
      createdAt: "2026-09-13T00:02:00Z",
    },
  ],
  visualAssets: [
    {
      id: "va-001",
      campaignId: "camp-001",
      versionNumber: 1,
      aspectRatio: "1:1",
      width: 1024,
      height: 1024,
      mediaType: "image/png",
      byteSize: 2048000,
      imageDigest: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      altText: "Poster quảng bá iPhone 15 Pro Max",
      storageKey: "marketing/camp-001/visual_v1.png",
      costMicros: 5000,
      createdAt: "2026-09-13T00:03:00Z",
    },
  ],
  publicationPackages: [],
  currentPackage: null,
  publicationAttempts: [],
  publicationRecord: null,
  artifacts: [
    {
      id: "art-001",
      campaignId: "camp-001",
      kind: "facebook_content_docx",
      filename: "facebook_content_camp-001.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      storageKey: "marketing/camp-001/facebook_content_camp-001.docx",
      byteSize: 4200,
      sha256Digest: "digest-001-abcdef1234567890",
      createdAt: "2026-09-13T00:04:00Z",
    },
    {
      id: "art-002",
      campaignId: "camp-001",
      kind: "facebook_visual_png",
      filename: "facebook_visual_camp-001.png",
      mediaType: "image/png",
      storageKey: "marketing/camp-001/facebook_visual_camp-001.png",
      byteSize: 2048000,
      sha256Digest: "digest-002-abcdef1234567890",
      createdAt: "2026-09-13T00:04:00Z",
    },
  ],
};

describe("MarketingCampaignModal", () => {
  it("renders the completed marketing work including headline, copywriter body, and visual specs", () => {
    render(
      <MarketingCampaignModal
        isOpen={true}
        onClose={vi.fn()}
        detail={sampleDetail}
        onApprove={vi.fn()}
      />
    );

    // Header & Badges
    expect(screen.getByText("Phòng Tiếp thị & Truyền thông Sáng tạo")).toBeInTheDocument();
    expect(screen.getByText("Chiến dịch: Quảng bá iPhone 15 Pro Max")).toBeInTheDocument();
    expect(screen.getByText(/Hoàn tất 100% • Chờ duyệt xuất bản/)).toBeInTheDocument();

    // Creative Tab: Content Draft & Visual Asset
    expect(screen.getByText("🚀 iPhone 15 Pro Max: Đỉnh cao công nghệ Titanium!")).toBeInTheDocument();
    expect(screen.getByText(/Thiết kế đột phá với khung Titanium siêu bền/)).toBeInTheDocument();
    expect(screen.getByText("#iPhone15ProMax")).toBeInTheDocument();
    expect(screen.getByText(/1:1 \(1024x1024\)/)).toBeInTheDocument();
  });

  it("switches to Facebook newsfeed social preview tab", () => {
    render(
      <MarketingCampaignModal
        isOpen={true}
        onClose={vi.fn()}
        detail={sampleDetail}
      />
    );

    const socialTab = screen.getByRole("button", { name: /Xem trước Facebook Feed/i });
    fireEvent.click(socialTab);

    expect(screen.getByText("NovaCommerce Official")).toBeInTheDocument();
    expect(screen.getByText("Thích")).toBeInTheDocument();
    expect(screen.getByText("Bình luận")).toBeInTheDocument();
    expect(screen.getByText("Chia sẻ")).toBeInTheDocument();
  });

  it("switches to deliverables tab and shows download buttons", () => {
    render(
      <MarketingCampaignModal
        isOpen={true}
        onClose={vi.fn()}
        detail={sampleDetail}
      />
    );

    const delivTab = screen.getByRole("button", { name: /Bộ 5 Tài liệu Bàn giao/i });
    fireEvent.click(delivTab);

    expect(screen.getByText(/Bộ 5 Tài Liệu Bàn Giao Chiến Dịch/i)).toBeInTheDocument();
    expect(screen.getByText("2. Các Phiên Bản Nội Dung Bài Viết (DOCX)")).toBeInTheDocument();
    expect(screen.getByText("3. Ấn Phẩm Hình Ảnh 1:1 Chuẩn Facebook (PNG)")).toBeInTheDocument();
  });

  it("triggers approve handler when clicking approve button", () => {
    const handleApprove = vi.fn();
    render(
      <MarketingCampaignModal
        isOpen={true}
        onClose={vi.fn()}
        detail={sampleDetail}
        onApprove={handleApprove}
      />
    );

    const approveBtn = screen.getByRole("button", { name: /Phê duyệt & Đăng Fanpage/i });
    fireEvent.click(approveBtn);
    expect(handleApprove).toHaveBeenCalledTimes(1);
  });

  it("renders failed state alert banner and triggers retry publication handler", () => {
    const handleRetry = vi.fn();
    const failedDetail: MarketingCampaignDetail = {
      ...sampleDetail,
      campaign: {
        ...sampleDetail.campaign,
        state: "failed",
      },
    };

    render(
      <MarketingCampaignModal
        isOpen={true}
        onClose={vi.fn()}
        detail={failedDetail}
        onRetryPublication={handleRetry}
      />
    );

    expect(screen.getByText(/Xuất bản gặp sự cố • Cần kiểm tra & Thử lại/i)).toBeInTheDocument();
    expect(screen.getByText(/xuất bản tự động lên Fanpage Facebook gặp sự cố/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /Thử xuất bản lại lên Fanpage/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders revision form immediately when initialShowRevisionForm is true", () => {
    render(
      <MarketingCampaignModal
        isOpen={true}
        onClose={vi.fn()}
        detail={sampleDetail}
        initialShowRevisionForm={true}
      />
    );

    expect(screen.getByText(/Nhập phản hồi yêu cầu đội ngũ Marketing chỉnh sửa/i)).toBeInTheDocument();
  });

  it("renders safely with minimal/fallback detail without crashing", () => {
    const fallbackDetail: MarketingCampaignDetail = {
      campaign: {
        id: "camp-fallback",
        state: "awaiting_human_approval",
        assignmentMode: "direct_department",
        createdBy: "user-1",
        idempotencyKey: "key-fb",
        version: 1,
        campaignName: "Chiến dịch Marketing Fanpage",
        createdAt: "2026-09-13T00:00:00Z",
        updatedAt: "2026-09-13T00:00:00Z",
      },
      brief: null,
      contentVersions: [],
      visualAssets: [],
      publicationPackages: [],
      currentPackage: null,
      publicationAttempts: [],
      publicationRecord: null,
      artifacts: [],
    };

    render(
      <MarketingCampaignModal
        isOpen={true}
        onClose={vi.fn()}
        detail={fallbackDetail}
      />
    );

    expect(screen.getByText("Chiến dịch Marketing Fanpage")).toBeInTheDocument();
    expect(screen.getByText(/0 file tài liệu kiểm toán/i)).toBeInTheDocument();
  });
});
