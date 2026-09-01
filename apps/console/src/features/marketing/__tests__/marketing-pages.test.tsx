// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { MarketingApi } from "../api/marketing-api";
import type { MarketingCampaign, MarketingCampaignDetail } from "../types";
import { MarketingCampaignListPage } from "../pages/marketing-campaign-list-page";
import { MarketingCampaignDetailPage } from "../pages/marketing-campaign-detail-page";

describe("Marketing Console Pages", () => {
  const sampleCampaign: MarketingCampaign = {
    id: "00000000-0000-4000-8000-000000000001",
    state: "awaiting_human_approval",
    assignmentMode: "direct_department",
    createdBy: "staff-1",
    idempotencyKey: "key-1",
    sourceTaskId: null,
    version: 1,
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
  };

  const sampleDetail: MarketingCampaignDetail = {
    campaign: sampleCampaign,
    brief: {
      id: "brief-1",
      campaignId: sampleCampaign.id,
      campaignName: "NovaPhone 15 Launch Campaign",
      objective: "Drive pre-orders for new smartphone",
      subjectKind: "catalog_product",
      subjectReference: "novaphone-15",
      audience: "Tech Enthusiasts",
      language: "vi",
      tone: "Exciting",
      mandatoryMessage: "Tặng tai nghe không dây khi đặt trước",
      prohibitedClaims: ["100% cure", "free money"],
      callToAction: "Đặt trước ngay",
      facebookPageConfigurationId: "page-official",
      scheduledFor: "2026-08-30T10:00:00.000Z",
      deadline: "2026-08-30T18:00:00.000Z",
      approverId: "staff-approver-1",
      maximumCostMicros: 500000,
      provenance: [],
      version: 1,
      createdAt: "2026-08-29T10:00:00.000Z",
    },
    contentVersions: [
      {
        id: "content-1",
        campaignId: sampleCampaign.id,
        versionNumber: 1,
        variant: "feed_post_square",
        headline: "Siêu phẩm NovaPhone 15",
        body: "Khám phá ngay NovaPhone 15 với camera đỉnh cao! Tặng tai nghe không dây khi đặt trước.",
        primaryText: "Khám phá ngay NovaPhone 15 với camera đỉnh cao! Tặng tai nghe không dây khi đặt trước.",
        callToAction: "Đặt trước ngay",
        hashtags: ["#NovaPhone15", "#OpenDX"],
        visualDirection: "Square product render",
        factualClaimSourceIds: [],
        contentDigest: "c".repeat(64),
        modelRunId: null,
        costMicros: 0,
        createdAt: "2026-08-29T10:00:00.000Z",
      },
    ],
    visualAssets: [
      {
        id: "visual-1",
        campaignId: sampleCampaign.id,
        versionNumber: 1,
        mediaType: "image/png",
        aspectRatio: "1:1",
        width: 1080,
        height: 1080,
        byteSize: 2048,
        imageDigest: "d".repeat(64),
        altText: "NovaPhone 15 Studio Render",
        storageKey: "marketing/visuals/hero.png",
        promptSummary: "Studio render on reflective surface",
        modelRunId: null,
        costMicros: 0,
        createdAt: "2026-08-29T10:00:00.000Z",
      },
    ],
    publicationPackages: [],
    currentPackage: {
      id: "pkg-1",
      campaignId: sampleCampaign.id,
      packageVersion: 1,
      contentVersionId: "content-1",
      visualAssetId: "visual-1",
      facebookPageConfigurationId: "page-official",
      scheduledFor: "2026-08-30T10:00:00.000Z",
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      packageDigest: "p".repeat(64),
      status: "submitted_for_approval",
      targets: [
        {
          id: "target-fb",
          packageId: "pkg-1",
          platform: "facebook",
          format: "feed_image",
          accountConfigurationId: "page-official",
          contentVersionId: "content-1",
          mediaAssetIds: ["visual-1"],
          caption: "Khám phá ngay NovaPhone 15",
          scheduledFor: "2026-08-30T10:00:00.000Z",
          required: true,
          executionMode: "live",
          contentDigest: "c".repeat(64),
          mediaDigest: "d".repeat(64),
          targetDigest: "t1".padEnd(64, "0"),
          status: "pending_approval",
          createdAt: "2026-08-29T10:00:00.000Z",
          updatedAt: "2026-08-29T10:00:00.000Z",
        },
        {
          id: "target-ig",
          packageId: "pkg-1",
          platform: "instagram",
          format: "feed_image",
          accountConfigurationId: "ig-default",
          contentVersionId: "content-1",
          mediaAssetIds: ["visual-1"],
          caption: "Khám phá ngay NovaPhone 15",
          scheduledFor: "2026-08-30T10:00:00.000Z",
          required: false,
          executionMode: "simulation",
          contentDigest: "c".repeat(64),
          mediaDigest: "d".repeat(64),
          targetDigest: "t2".padEnd(64, "0"),
          status: "pending_approval",
          createdAt: "2026-08-29T10:00:00.000Z",
          updatedAt: "2026-08-29T10:00:00.000Z",
        },
      ],
      createdAt: "2026-08-29T10:00:00.000Z",
      updatedAt: "2026-08-29T10:00:00.000Z",
    },
    publicationAttempts: [],
    publicationRecord: {
      id: "record-1",
      packageId: "pkg-1",
      platform: "facebook",
      pageId: "page-official",
      externalPostId: "page-official_123456",
      postUrl: "https://www.facebook.com/page-official/posts/123456",
      packageDigest: "p".repeat(64),
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      verifiedAt: "2026-08-29T10:00:00.000Z",
      providerReceiptDigest: "r".repeat(64),
      createdAt: "2026-08-29T10:00:00.000Z",
    },
    artifacts: [
      {
        id: "art-1",
        campaignId: sampleCampaign.id,
        kind: "campaign_brief_docx",
        filename: "brief.docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: 4096,
        sha256Digest: "a".repeat(64),
        storageKey: "marketing/test/brief.docx",
        createdAt: "2026-08-29T10:00:00.000Z",
      },
    ],
  };

  it("renders MarketingCampaignListPage with campaign items", async () => {
    const mockApi: MarketingApi = {
      listCampaigns: vi.fn().mockResolvedValue({ items: [sampleCampaign], total: 1 }),
      getCampaign: vi.fn(),
      createCampaign: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn(),
      retryPublication: vi.fn(),
      retryTargetPublication: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
      generateDeliverables: vi.fn(),
      listArtifacts: vi.fn(),
      getArtifactDownloadUrl: vi.fn((id) => `/download/${id}`),
    };

    render(
      <MemoryRouter>
        <MarketingCampaignListPage api={mockApi} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Marketing & Creative Publication/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting human approval/i)).toBeInTheDocument();
    expect(screen.getByText(/View Control Room/i)).toBeInTheDocument();
  });

  it("renders MarketingCampaignDetailPage with full control room details", async () => {
    const mockApi: MarketingApi = {
      listCampaigns: vi.fn(),
      getCampaign: vi.fn().mockResolvedValue(sampleDetail),
      createCampaign: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn().mockResolvedValue(sampleCampaign),
      retryPublication: vi.fn(),
      retryTargetPublication: vi.fn(),
      requestRevision: vi.fn().mockResolvedValue(sampleCampaign),
      qualityFeedback: vi.fn(),
      generateDeliverables: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listArtifacts: vi.fn(),
      getArtifactDownloadUrl: vi.fn((id) => `/download/${id}`),
    };

    render(
      <MemoryRouter initialEntries={[`/marketing/campaigns/${sampleCampaign.id}`]}>
        <Routes>
          <Route
            path="/marketing/campaigns/:campaignId"
            element={<MarketingCampaignDetailPage api={mockApi} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findAllByText(/NovaPhone 15 Launch Campaign/i)).toHaveLength(2);
    expect(screen.getAllByText(/Tặng tai nghe không dây khi đặt trước/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Siêu phẩm NovaPhone 15/i)).toBeInTheDocument();
    expect(screen.getByText(/1:1 Square \(1080x1080\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Xem Bài Đăng Trực Tuyến/i)).toBeInTheDocument();

    // Verify multi-target cards rendered
    expect(screen.getByText(/Kênh Xuất Bản Đa Nền Tảng/i)).toBeInTheDocument();
    expect(screen.getByText(/Facebook • Feed Image \(1:1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Instagram • Feed Image \(1:1\)/i)).toBeInTheDocument();

    // Click Approve button
    const approveBtn = screen.getByRole("button", { name: /Approve & Publish to Facebook/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockApi.approveCampaign).toHaveBeenCalledWith(sampleCampaign.id, { decision: "approve" });
    });
  });

  it("opens multi-platform live post preview modal", async () => {
    const mockApi: MarketingApi = {
      listCampaigns: vi.fn(),
      getCampaign: vi.fn().mockResolvedValue(sampleDetail),
      createCampaign: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn(),
      retryPublication: vi.fn(),
      retryTargetPublication: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
      generateDeliverables: vi.fn(),
      listArtifacts: vi.fn(),
      getArtifactDownloadUrl: vi.fn((id) => `/download/${id}`),
    };

    render(
      <MemoryRouter initialEntries={[`/marketing/campaigns/${sampleCampaign.id}`]}>
        <Routes>
          <Route
            path="/marketing/campaigns/:campaignId"
            element={<MarketingCampaignDetailPage api={mockApi} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findAllByText(/NovaPhone 15 Launch Campaign/i)).toHaveLength(2);

    const previewBtn = screen.getByRole("button", { name: /Preview Facebook Post/i });
    await userEvent.click(previewBtn);

    expect(await screen.findByText(/Multi-Platform Publication Preview/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Facebook Feed \(1:1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Instagram Feed \(1:1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Instagram Story \(9:16\)/i })).toBeInTheDocument();
  });

  it("offers an explicit retry for a failed approved publication", async () => {
    const approvedPackage = {
      id: "pkg-approved-1",
      campaignId: sampleCampaign.id,
      packageVersion: 1,
      contentVersionId: "content-1",
      visualAssetId: "visual-1",
      facebookPageConfigurationId: "page-official",
      scheduledFor: "2026-08-30T10:00:00.000Z",
      contentDigest: "c".repeat(64),
      imageDigest: "d".repeat(64),
      packageDigest: "p".repeat(64),
      status: "approved" as const,
      approvalRequestId: "approval-1",
      targets: [],
      createdAt: "2026-08-29T10:00:00.000Z",
      updatedAt: "2026-08-29T10:00:00.000Z",
    };
    const failedDetail: MarketingCampaignDetail = {
      ...sampleDetail,
      campaign: { ...sampleCampaign, state: "failed" },
      publicationPackages: [approvedPackage],
      currentPackage: approvedPackage,
      publicationRecord: null,
    };
    const retryPublication = vi.fn().mockResolvedValue({});
    const mockApi = {
      listCampaigns: vi.fn(),
      getCampaign: vi.fn().mockResolvedValue(failedDetail),
      createCampaign: vi.fn(),
      markReady: vi.fn(),
      cancelCampaign: vi.fn(),
      approveCampaign: vi.fn(),
      retryPublication,
      retryTargetPublication: vi.fn(),
      requestRevision: vi.fn(),
      qualityFeedback: vi.fn(),
      generateDeliverables: vi.fn(),
      listArtifacts: vi.fn(),
      getArtifactDownloadUrl: vi.fn((id: string) => `/download/${id}`),
    } as MarketingApi;

    render(
      <MemoryRouter initialEntries={[`/marketing/campaigns/${sampleCampaign.id}`]}>
        <Routes>
          <Route
            path="/marketing/campaigns/:campaignId"
            element={<MarketingCampaignDetailPage api={mockApi} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const retryButton = await screen.findByRole("button", { name: /Đăng lại lên Facebook/i });
    await userEvent.click(retryButton);

    await waitFor(() => {
      expect(retryPublication).toHaveBeenCalledWith(sampleCampaign.id);
    });
  });
});
