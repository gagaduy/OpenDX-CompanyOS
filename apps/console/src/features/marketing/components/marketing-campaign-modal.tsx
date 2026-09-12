// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  ThumbsUp,
  X,
} from "lucide-react";
import type { MarketingApi } from "../api/marketing-api";
import type { MarketingCampaignDetail } from "../types";
import { CampaignBriefCard } from "./campaign-brief-card";
import { ContentDraftPreview } from "./content-draft-preview";
import { VisualAssetPreview } from "./visual-asset-preview";
import { MarketingDeliverablesPanel } from "./marketing-deliverables-panel";
import "../styles/marketing.css";

export interface MarketingCampaignModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly detail: MarketingCampaignDetail;
  readonly onApprove?: () => Promise<void> | void;
  readonly onRequestRevision?: (feedback: string) => Promise<void> | void;
  readonly onRetryPublication?: () => Promise<void> | void;
  readonly api?: MarketingApi;
  readonly isActionLoading?: boolean;
}

type TabType = "creative" | "social" | "deliverables" | "brief";

export function MarketingCampaignModal({
  isOpen,
  onClose,
  detail,
  onApprove,
  onRequestRevision,
  onRetryPublication,
  api,
  isActionLoading = false,
}: MarketingCampaignModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("creative");
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  // Visual asset blob loader
  const visualId = detail?.visualAssets?.at(-1)?.id;
  const [preview, setPreview] = useState<{ id: string; url?: string; error: boolean }>();
  const [previewRetry, setPreviewRetry] = useState(0);

  useEffect(() => {
    setPreview(undefined);
    if (!visualId || !api?.fetchVisualAssetBlob) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;

    void api
      .fetchVisualAssetBlob(visualId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ id: visualId, url: objectUrl, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ id: visualId, error: true });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, visualId, previewRetry]);

  if (!isOpen || !detail) return null;

  const { campaign, brief, contentVersions, visualAssets, artifacts } = detail;
  const latestContent = contentVersions?.[contentVersions.length - 1];
  const latestVisual = visualAssets?.[visualAssets.length - 1];
  const isApprovedOrPublished =
    campaign.state === "completed" ||
    campaign.state === "publishing" ||
    campaign.state === "verifying_publication";

  const handleCopyPostText = async () => {
    if (!latestContent) return;
    try {
      const fullText = `${latestContent.headline ? `${latestContent.headline}\n\n` : ""}${latestContent.body}\n\n${(latestContent.hashtags || []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;
      await navigator.clipboard.writeText(fullText);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    } catch {
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    }
  };

  const handleSubmitRevision = async () => {
    if (!revisionFeedback.trim() || !onRequestRevision) return;
    try {
      setIsSubmittingRevision(true);
      await onRequestRevision(revisionFeedback.trim());
      setRevisionFeedback("");
      setShowRevisionForm(false);
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const getDownloadUrl = (artifactId: string) => {
    if (api?.getArtifactDownloadUrl) {
      return api.getArtifactDownloadUrl(artifactId);
    }
    return `/v1/admin/marketing/artifacts/${artifactId}/download`;
  };

  return (
    <div
      className="ccOperationsModalBackdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 10000 }}
    >
      <div
        className="ccOperationsModalContainer"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1140px, 95vw)",
          maxHeight: "92vh",
          borderColor: "rgba(59, 130, 246, 0.35)",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 35px rgba(59, 130, 246, 0.2)",
        }}
      >
        {/* Modal Header */}
        <div
          className="ccOperationsModalHeader"
          style={{
            background: "linear-gradient(180deg, #0d1527 0%, #0a0f1d 100%)",
            borderBottom: "1px solid rgba(59, 130, 246, 0.2)",
          }}
        >
          <div className="ccOperationsModalHeaderTitle">
            <div
              className="ccOperationsIconBadge"
              style={{
                background: "linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(168, 85, 247, 0.25))",
                borderColor: "rgba(59, 130, 246, 0.4)",
                color: "#60a5fa",
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#60a5fa",
                    background: "rgba(59, 130, 246, 0.12)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                    border: "1px solid rgba(59, 130, 246, 0.25)",
                  }}
                >
                  Phòng Tiếp thị & Truyền thông Sáng tạo
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: isApprovedOrPublished ? "#4ade80" : "#fbbf24",
                    background: isApprovedOrPublished ? "rgba(34, 197, 94, 0.15)" : "rgba(251, 191, 36, 0.15)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "9999px",
                    border: `1px solid ${isApprovedOrPublished ? "rgba(34, 197, 94, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <CheckCircle2 size={11} />
                  {isApprovedOrPublished ? "Đã Xuất bản Thành công" : "Hoàn tất 100% • Chờ duyệt xuất bản"}
                </span>
              </div>
              <h2 className="ccOperationsModalHeading" style={{ marginTop: "0.25rem", fontSize: "1.2rem" }}>
                {campaign.campaignName || "Chiến dịch Tiếp thị & Truyền thông Sáng tạo"}
              </h2>
              <p className="ccOperationsModalSubheading" style={{ color: "#94a3b8" }}>
                Chỉ đạo thực thi: &ldquo;{brief?.objective || campaign.campaignName}&rdquo;
              </p>
            </div>
          </div>

          <button
            type="button"
            className="ccOperationsModalCloseBtn"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X size={18} />
          </button>
        </div>

        {/* Highlight Stats Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
            padding: "0.85rem 1.75rem",
            background: "rgba(15, 23, 42, 0.7)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.1rem" }}>🎯</span>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Kênh mục tiêu</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0" }}>Facebook Fanpage & Instagram</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.1rem" }}>🤖</span>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Nhân sự số thực thi</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0" }}>3 AI Agents (Copy, Visual, Publish)</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.1rem" }}>📐</span>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Quy chuẩn Đồ họa</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0" }}>
                {latestVisual ? `${latestVisual.width}x${latestVisual.height} (${latestVisual.aspectRatio})` : "1024x1024 (1:1)"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.1rem" }}>📦</span>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Hồ sơ Bàn giao</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0" }}>{artifacts.length} file tài liệu kiểm toán</div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1.75rem",
            background: "#080c16",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("creative")}
            style={{
              padding: "0.55rem 1rem",
              background: activeTab === "creative" ? "rgba(59, 130, 246, 0.15)" : "transparent",
              border: "1px solid",
              borderColor: activeTab === "creative" ? "rgba(59, 130, 246, 0.4)" : "transparent",
              borderRadius: "8px",
              color: activeTab === "creative" ? "#60a5fa" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.84rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              transition: "all 0.15s ease",
            }}
          >
            <span>✍️</span> Bài viết & Poster Đồ họa
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("social")}
            style={{
              padding: "0.55rem 1rem",
              background: activeTab === "social" ? "rgba(59, 130, 246, 0.15)" : "transparent",
              border: "1px solid",
              borderColor: activeTab === "social" ? "rgba(59, 130, 246, 0.4)" : "transparent",
              borderRadius: "8px",
              color: activeTab === "social" ? "#60a5fa" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.84rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              transition: "all 0.15s ease",
            }}
          >
            <span>📱</span> Xem trước Facebook Feed
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("deliverables")}
            style={{
              padding: "0.55rem 1rem",
              background: activeTab === "deliverables" ? "rgba(59, 130, 246, 0.15)" : "transparent",
              border: "1px solid",
              borderColor: activeTab === "deliverables" ? "rgba(59, 130, 246, 0.4)" : "transparent",
              borderRadius: "8px",
              color: activeTab === "deliverables" ? "#60a5fa" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.84rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              transition: "all 0.15s ease",
            }}
          >
            <span>📦</span> Bộ 5 Tài liệu Bàn giao ({artifacts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("brief")}
            style={{
              padding: "0.55rem 1rem",
              background: activeTab === "brief" ? "rgba(59, 130, 246, 0.15)" : "transparent",
              border: "1px solid",
              borderColor: activeTab === "brief" ? "rgba(59, 130, 246, 0.4)" : "transparent",
              borderRadius: "8px",
              color: activeTab === "brief" ? "#60a5fa" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.84rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              transition: "all 0.15s ease",
            }}
          >
            <span>📋</span> Bản mô tả Brief
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem 1.75rem",
            background: "#08090c",
          }}
        >
          {/* TAB 1: Creative Work (Draft + Poster) */}
          {activeTab === "creative" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(30, 41, 59, 0.4)",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                  💡 <strong>Nghiệm thu trực tiếp:</strong> Cây bút Sáng tạo đã hoàn thiện bản thảo bài viết và Thiết kế Đồ họa đã dựng ấn phẩm poster chuẩn tỷ lệ 1:1.
                </div>
                <button
                  type="button"
                  className="marketingBtnSecondary"
                  onClick={handleCopyPostText}
                  style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem" }}
                >
                  {copiedContent ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                  <span>{copiedContent ? "Đã chép nội dung!" : "Sao chép bài viết"}</span>
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
                  gap: "1.25rem",
                  alignItems: "start",
                }}
              >
                <ContentDraftPreview contents={contentVersions || []} />
                <VisualAssetPreview
                  visuals={visualAssets || []}
                  imageUrl={preview?.id === visualId ? preview?.url : undefined}
                  loading={Boolean(visualId) && preview?.id !== visualId}
                  error={preview?.id === visualId && preview?.error === true}
                  onRetry={() => setPreviewRetry((v) => v + 1)}
                />
              </div>
            </div>
          )}

          {/* TAB 2: Live Facebook Newsfeed Mockup */}
          {activeTab === "social" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "1rem 0" }}>
              <div
                style={{
                  background: "#242526",
                  borderRadius: "0.75rem",
                  border: "1px solid #3a3b3c",
                  overflow: "hidden",
                  maxWidth: "560px",
                  width: "100%",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                }}
              >
                {/* Facebook Mockup Header */}
                <div className="fbHeader">
                  <div className="fbAvatar">N</div>
                  <div style={{ flex: 1 }}>
                    <div className="fbPageName">
                      <span>NovaCommerce Official</span>
                      <span style={{ color: "#1877f2", fontSize: "0.85rem" }}>✓</span>
                    </div>
                    <div className="fbPostTime">
                      <span>Vừa xong</span>
                      <span>•</span>
                      <span>🌐 Công khai</span>
                    </div>
                  </div>
                </div>

                {/* Post Content */}
                <div className="fbContent" style={{ whiteSpace: "pre-line" }}>
                  {latestContent?.headline && (
                    <div style={{ fontWeight: 800, color: "#ffffff", fontSize: "1rem", marginBottom: "0.5rem" }}>
                      {latestContent.headline}
                    </div>
                  )}
                  <div style={{ color: "#e4e6eb", lineHeight: 1.5 }}>
                    {latestContent?.body || "Nội dung bài viết đang được tạo..."}
                  </div>
                  {latestContent?.hashtags && latestContent.hashtags.length > 0 && (
                    <div style={{ marginTop: "0.75rem", color: "#4599ff", fontWeight: 600 }}>
                      {latestContent.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                    </div>
                  )}
                </div>

                {/* Poster Graphic Frame */}
                <div className="fbImageSection" style={{ minHeight: "300px", background: "#18191a" }}>
                  {preview?.url ? (
                    <img
                      src={preview.url}
                      alt={latestVisual?.altText || "Poster chiến dịch"}
                      style={{ display: "block", width: "100%", height: "auto", objectFit: "contain" }}
                    />
                  ) : (
                    <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
                      <p>🖼️ Đang nạp ấn phẩm poster trực quan...</p>
                    </div>
                  )}
                </div>

                {/* Engagement Bar */}
                <div
                  style={{
                    padding: "0.5rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "#b0b3b8",
                    borderBottom: "1px solid #3a3b3c",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span style={{ background: "#1877f2", borderRadius: "50%", width: "18px", height: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "#fff" }}>👍</span>
                    <span style={{ background: "#fa3e3e", borderRadius: "50%", width: "18px", height: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "#fff" }}>❤️</span>
                    <span>324</span>
                  </span>
                  <span>56 bình luận • 28 lượt chia sẻ</span>
                </div>

                {/* Actions Bar */}
                <div className="fbActionsBar">
                  <button type="button" className="fbActionBtn">
                    <ThumbsUp size={14} /> <span>Thích</span>
                  </button>
                  <button type="button" className="fbActionBtn">
                    <MessageSquare size={14} /> <span>Bình luận</span>
                  </button>
                  <button type="button" className="fbActionBtn">
                    <Share2 size={14} /> <span>Chia sẻ</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Deliverables Panel */}
          {activeTab === "deliverables" && (
            <div>
              <MarketingDeliverablesPanel
                artifacts={artifacts || []}
                getDownloadUrl={getDownloadUrl}
              />
            </div>
          )}

          {/* TAB 4: Campaign Brief Card */}
          {activeTab === "brief" && (
            <div>
              <CampaignBriefCard brief={brief} />
            </div>
          )}

          {/* Revision feedback drawer/box */}
          {showRevisionForm && (
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1.25rem",
                background: "rgba(30, 41, 59, 0.7)",
                borderRadius: "12px",
                border: "1px solid rgba(251, 191, 36, 0.3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fbbf24" }}>
                  ✎ Nhập phản hồi yêu cầu đội ngũ Marketing chỉnh sửa:
                </span>
                <button
                  type="button"
                  onClick={() => setShowRevisionForm(false)}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
                >
                  <X size={16} />
                </button>
              </div>
              <textarea
                value={revisionFeedback}
                onChange={(e) => setRevisionFeedback(e.target.value)}
                placeholder="Ví dụ: Bổ sung thêm ưu đãi tặng sạc dự phòng trong bài viết, đổi màu nền poster sang tone tím ánh kim..."
                rows={3}
                style={{
                  width: "100%",
                  background: "#0f172a",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  color: "#fff",
                  fontSize: "0.85rem",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="marketingBtnSecondary"
                  onClick={() => setShowRevisionForm(false)}
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="marketingBtnPrimary"
                  onClick={handleSubmitRevision}
                  disabled={!revisionFeedback.trim() || isSubmittingRevision}
                  style={{ fontSize: "0.8rem", padding: "0.4rem 1rem" }}
                >
                  {isSubmittingRevision ? <Loader2 size={14} className="ccSpin" /> : <Send size={14} />}
                  <span>Gửi yêu cầu làm lại</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div
          className="ccOperationsModalFooter"
          style={{
            background: "#0b0f19",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "1rem 1.75rem",
          }}
        >
          <div className="ccOperationsFooterLeft" style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="marketingBtnSecondary"
              onClick={() => setActiveTab(activeTab === "social" ? "creative" : "social")}
              style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
            >
              <Eye size={14} />
              <span>{activeTab === "social" ? "Xem bài & poster" : "Xem trước Facebook"}</span>
            </button>

            <button
              type="button"
              className="marketingBtnSecondary"
              onClick={() => setActiveTab("deliverables")}
              style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
            >
              <Download size={14} />
              <span>Tải bộ 5 Deliverables ({artifacts.length})</span>
            </button>
          </div>

          <div className="ccOperationsFooterRight" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              className="ccOperationsCancelBtn"
              onClick={onClose}
              style={{ fontSize: "0.85rem" }}
            >
              Đóng
            </button>

            {!isApprovedOrPublished && onRequestRevision && (
              <button
                type="button"
                className="marketingBtnSecondary"
                onClick={() => setShowRevisionForm((v) => !v)}
                style={{ fontSize: "0.85rem", borderColor: "rgba(251, 191, 36, 0.4)", color: "#fef08a" }}
              >
                <Edit3 size={15} />
                <span>Yêu cầu chỉnh sửa</span>
              </button>
            )}

            {!isApprovedOrPublished && onApprove && (
              <button
                type="button"
                className="marketingBtnPrimary"
                disabled={isActionLoading}
                onClick={onApprove}
                style={{
                  fontSize: "0.85rem",
                  padding: "0.55rem 1.25rem",
                  background: "linear-gradient(135deg, #1877f2 0%, #2563eb 100%)",
                }}
              >
                {isActionLoading ? <Loader2 size={16} className="ccSpin" /> : <CheckCircle2 size={16} />}
                <span>{isActionLoading ? "Đang xuất bản lên Fanpage..." : "✓ Phê duyệt & Đăng Fanpage"}</span>
              </button>
            )}

            {isApprovedOrPublished && (
              <span
                style={{
                  color: "#4ade80",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <CheckCircle2 size={16} /> Đã xuất bản lên Fanpage thành công
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
