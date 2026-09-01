// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MarketingApi } from "../api/marketing-api";
import type { MarketingCampaignDetail, PublicationTarget } from "../types";
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
      setError(err.message || "Đăng lại thất bại");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryTarget = async (targetId: string) => {
    if (!campaignId) return;
    try {
      setActionLoading(true);
      await api.retryTargetPublication(campaignId, targetId);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Đăng lại mục tiêu thất bại");
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

  const { campaign, brief, contentVersions, visualAssets, artifacts, publicationRecord, publicationRecords, currentPackage } = detail;
  const latestContent = contentVersions[contentVersions.length - 1] ?? null;
  const latestVisual = visualAssets[visualAssets.length - 1] ?? null;
  const targets = currentPackage?.targets ?? [];
  const isAwaiting = campaign.state === "awaiting_human_approval";
  const isLive = campaign.state === "completed" || campaign.state === "publishing";
  const isPartialFailure = campaign.state === "partial_failure";
  const badgeClass = isAwaiting
    ? "statusBadge awaitingApproval"
    : isLive
    ? "statusBadge publishedLive"
    : isPartialFailure
    ? "statusBadge partialFailure"
    : "statusBadge drafting";

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
              {isAwaiting
                ? "⏳ Chờ Phê Duyệt"
                : isLive
                ? "✅ Đã Xuất Bản Thành Công"
                : isPartialFailure
                ? "⚠️ Một Số Kênh Thất Bại"
                : campaign.state.replace(/_/g, " ")}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Tạo bởi <strong style={{ color: "#cbd5e1" }}>{campaign.createdBy}</strong> lúc {new Date(campaign.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {(() => {
            const records = (publicationRecords && publicationRecords.length > 0)
              ? publicationRecords
              : (publicationRecord ? [publicationRecord] : []);

            const fbRecord = records.find((r) => r.platform === "facebook" && r.postUrl);
            const igRecord = records.find((r) => r.platform === "instagram" && r.postUrl);

            return (
              <>
                {fbRecord?.postUrl && (
                  <a
                    href={fbRecord.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="marketingBtnSuccess"
                  >
                    <span>🔵</span> Xem bài trên Facebook ↗
                  </a>
                )}
                {igRecord?.postUrl && (
                  <a
                    href={igRecord.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="marketingBtnSuccess"
                    style={{
                      background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                      color: "#fff",
                      border: "none",
                    }}
                  >
                    <span>📸</span> Xem bài trên Instagram ↗
                  </a>
                )}
              </>
            );
          })()}
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
          (campaign.state === "failed" || campaign.state === "partial_failure") &&
          detail.currentPackage?.status === "approved"
        }
      />

      {/* Multi-Platform Publication Targets Card */}
      {targets.length > 0 && (
        <div style={{ background: "#111827", borderRadius: "1rem", border: "1px solid #1f2937", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 700, color: "#f3f4f6", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>🎯</span> Kênh Xuất Bản Đa Nền Tảng (Multi-Platform Targets)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {targets.map((target) => {
              const isTargetVerified = target.status === "verified";
              const isTargetFailed = target.status === "failed" || target.status === "platform_rejected";
              const platformIcon = target.platform === "facebook" ? "🔵" : "📸";
              const platformLabel = target.platform === "facebook" ? "Facebook" : "Instagram";
              const formatLabel = target.format === "feed_image" ? "Feed Image (1:1)" : target.format === "story_image" ? "Story (9:16)" : "Carousel (1:1)";

              return (
                <div
                  key={target.id}
                  style={{
                    background: "#1f2937",
                    borderRadius: "0.75rem",
                    border: `1px solid ${isTargetVerified ? "rgba(34, 197, 94, 0.4)" : isTargetFailed ? "rgba(239, 68, 68, 0.4)" : "#374151"}`,
                    padding: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, color: "#f9fafb" }}>
                      <span>{platformIcon}</span> {platformLabel} • {formatLabel}
                    </div>
                    <span
                      style={{
                        padding: "0.2rem 0.6rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: isTargetVerified ? "rgba(34, 197, 94, 0.2)" : isTargetFailed ? "rgba(239, 68, 68, 0.2)" : "rgba(107, 114, 128, 0.2)",
                        color: isTargetVerified ? "#4ade80" : isTargetFailed ? "#f87171" : "#9ca3af",
                      }}
                    >
                      {target.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "0.5rem" }}>
                    Chế độ: <strong style={{ color: "#e5e7eb" }}>{target.executionMode}</strong> {target.required ? "• Bắt buộc" : "• Tùy chọn"}
                  </div>
                  {isTargetFailed && (
                    <button
                      type="button"
                      onClick={() => handleRetryTarget(target.id)}
                      disabled={actionLoading}
                      className="marketingBtnSecondary"
                      style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", width: "100%", justifyContent: "center" }}
                    >
                      🔄 Thử lại kênh này
                    </button>
                  )}
                  {isTargetVerified && (() => {
                    const targetRecord = (publicationRecords || []).find((r) => r.targetId === target.id || r.platform === target.platform)
                      || (publicationRecord?.targetId === target.id || publicationRecord?.platform === target.platform ? publicationRecord : null);

                    if (!targetRecord?.postUrl) return null;

                    return (
                      <a
                        href={targetRecord.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="marketingBtnSecondary"
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.35rem 0.6rem",
                          width: "100%",
                          justifyContent: "center",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          textDecoration: "none",
                          color: target.platform === "instagram" ? "#f472b6" : "#60a5fa",
                          borderColor: target.platform === "instagram" ? "rgba(244, 114, 182, 0.4)" : "rgba(96, 165, 250, 0.4)",
                          background: target.platform === "instagram" ? "rgba(244, 114, 182, 0.1)" : "rgba(96, 165, 250, 0.1)",
                          borderRadius: "0.5rem",
                          fontWeight: 600,
                          marginTop: "0.5rem",
                        }}
                      >
                        <span>{target.platform === "facebook" ? "🔵" : "📸"}</span> Xem bài trên {platformLabel} ↗
                      </a>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Live Social Post Preview Modal */}
      <FacebookPostPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        brief={brief}
        content={latestContent}
        visual={latestVisual}
        targets={targets}
      />
    </div>
  );
}
