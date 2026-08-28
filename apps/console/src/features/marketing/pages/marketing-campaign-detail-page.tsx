// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MarketingApi } from "../api/marketing-api";
import type { MarketingCampaignDetail } from "../types";
import { CampaignBriefCard } from "../components/campaign-brief-card";
import { ContentDraftPreview } from "../components/content-draft-preview";
import { VisualAssetPreview } from "../components/visual-asset-preview";
import { FacebookPostPreviewModal } from "../components/facebook-post-preview-modal";
import { CampaignApprovalActionBar } from "../components/campaign-approval-action-bar";
import { MarketingDeliverablesPanel } from "../components/marketing-deliverables-panel";
import "../styles/marketing.css";

export function MarketingCampaignDetailPage({
  api,
}: {
  readonly api: MarketingApi;
}) {
  const { campaignId } = useParams();
  const [detail, setDetail] = useState<MarketingCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadData = async () => {
    if (!campaignId) return;
    try {
      setLoading(true);
      const data = await api.getCampaign(campaignId);
      setDetail(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Không thể tải chi tiết chiến dịch tiếp thị");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [campaignId]);

  const handleApprove = async () => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.approveCampaign(campaignId, { decision: "approve" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Phê duyệt chiến dịch thất bại");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRevision = async (feedback: string) => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.requestRevision(campaignId, { feedback });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Yêu cầu chỉnh sửa thất bại");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryPublication = async () => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.retryPublication(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Đăng lại lên Facebook thất bại");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateDeliverables = async () => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.generateDeliverables(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Xuất bản tài liệu bàn giao thất bại");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="marketingWorkspace" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔄</div>
          <div>Đang tải phòng điều khiển chiến dịch...</div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="marketingWorkspace">
        <div style={{ padding: "1.5rem", borderRadius: "1rem", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", marginBottom: "1rem" }}>
          {error || "Không tìm thấy chiến dịch tiếp thị yêu cầu"}
        </div>
        <Link to="/marketing/campaigns" className="marketingBtnSecondary">
          ← Quay lại Danh sách Chiến dịch
        </Link>
      </div>
    );
  }

  const { campaign, brief, contentVersions, visualAssets, artifacts, publicationRecord } = detail;
  const latestContent = contentVersions[contentVersions.length - 1] ?? null;
  const latestVisual = visualAssets[visualAssets.length - 1] ?? null;
  const isAwaiting = campaign.state === "awaiting_human_approval";
  const isLive = campaign.state === "completed" || campaign.state === "publishing";
  const badgeClass = isAwaiting ? "statusBadge awaitingApproval" : isLive ? "statusBadge publishedLive" : "statusBadge drafting";

  return (
    <div className="marketingWorkspace">
      {/* Header & Controls */}
      <div className="marketingHeader">
        <div>
          <div className="marketingBreadcrumb">
            <Link to="/marketing/campaigns">Tiếp thị & Sáng tạo</Link>
            <span>/</span>
            <span style={{ color: "#cbd5e1", fontFamily: "monospace" }}>#{campaign.id.slice(0, 8)}</span>
          </div>
          <h1 className="marketingTitle">
            <span>📢</span> {brief?.campaignName ?? "Chiến dịch Tiếp thị"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
            <span className={badgeClass}>
              {isAwaiting ? "⏳ Chờ Phê Duyệt" : isLive ? "✅ Đã Đăng Live Facebook" : campaign.state.replace(/_/g, " ")}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Tạo bởi <strong style={{ color: "#cbd5e1" }}>{campaign.createdBy}</strong> lúc {new Date(campaign.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {publicationRecord && (
            <a
              href={publicationRecord.postUrl}
              target="_blank"
              rel="noreferrer"
              className="marketingBtnSuccess"
            >
              <span>🌐</span> View Live Facebook Post ↗
            </a>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: "1.25rem 1.5rem", borderRadius: "0.85rem", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", fontSize: "0.875rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.3rem" }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, color: "#fee2e2" }}>
                {error.includes("Authentication") || error.includes("xác thực") || error.includes("401") || error.includes("hết hạn")
                  ? "Phiên đăng nhập quản trị viên đã hết hạn"
                  : "Có lỗi xảy ra"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#fca5a5", marginTop: "0.2rem" }}>
                {error.includes("Authentication") || error.includes("xác thực") || error.includes("401")
                  ? "Mã xác thực Keycloak của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục thao tác."
                  : error}
              </div>
            </div>
          </div>
          {(error.includes("Authentication") || error.includes("xác thực") || error.includes("401") || error.includes("hết hạn")) && (
            <button
              type="button"
              onClick={() => {
                sessionStorage.clear();
                window.location.href = "/sign-in";
              }}
              className="marketingBtnPrimary"
              style={{ padding: "0.5rem 1.1rem", fontSize: "0.8rem", whiteSpace: "nowrap" }}
            >
              🔐 Đăng nhập lại ngay
            </button>
          )}
        </div>
      )}

      {/* Action Bar */}
      <CampaignApprovalActionBar
        campaign={campaign}
        onApprove={handleApprove}
        onRetryPublication={handleRetryPublication}
        onRequestRevision={handleRequestRevision}
        onGenerateDeliverables={handleGenerateDeliverables}
        onOpenPreview={() => setPreviewOpen(true)}
        loading={actionLoading}
        canRetryPublication={
          campaign.state === "failed" &&
          detail.currentPackage?.status === "approved" &&
          !detail.publicationRecord
        }
      />

      {/* Brief Card */}
      <CampaignBriefCard brief={brief} />

      {/* Creative Split: Content Draft & Visual Asset */}
      <div className="marketingDetailGrid">
        <ContentDraftPreview contents={contentVersions} />
        <VisualAssetPreview visuals={visualAssets} />
      </div>

      {/* Deliverables Panel */}
      <MarketingDeliverablesPanel
        artifacts={artifacts}
        getDownloadUrl={api.getArtifactDownloadUrl}
      />

      {/* Live Facebook Post Preview Modal */}
      <FacebookPostPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        brief={brief}
        content={latestContent}
        visual={latestVisual}
      />
    </div>
  );
}
