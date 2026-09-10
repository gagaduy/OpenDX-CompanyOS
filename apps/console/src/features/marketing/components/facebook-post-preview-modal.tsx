// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import type { CampaignBrief, ContentVersion, PublicationTarget, VisualAsset } from "../types";
import "../styles/marketing.css";

export function FacebookPostPreviewModal({
  isOpen,
  onClose,
  brief,
  content,
  visual,
  targets,
  imageUrl,
  imageLoading = false,
  imageError = false,
  onImageRetry,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly brief: CampaignBrief | null;
  readonly content: ContentVersion | null;
  readonly visual: VisualAsset | null;
  readonly targets?: readonly PublicationTarget[];
  readonly imageUrl?: string;
  readonly imageLoading?: boolean;
  readonly imageError?: boolean;
  readonly onImageRetry?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"facebook_feed" | "instagram_feed" | "instagram_story">("facebook_feed");
  const [failedUrl, setFailedUrl] = useState<string>();

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const bodyText = content?.primaryText ?? content?.body ?? "Chưa có nội dung bài viết.";
  const headline = content?.headline;
  const hashtags = content?.hashtags ?? [];
  const imagePreview = imageLoading ? <p role="status">Đang tải hình ảnh...</p>
    : imageError || (imageUrl && failedUrl === imageUrl) ? <div role="alert">
      <p>Không tải được hình ảnh.</p>
      {onImageRetry && <button type="button" onClick={onImageRetry} className="marketingBtnSecondary" title="Tải lại hình ảnh" aria-label="Tải lại hình ảnh"><RefreshCw size={16} /></button>}
    </div>
    : imageUrl ? <img src={imageUrl} alt={visual?.altText || "Hình ảnh chiến dịch"}
      width={visual?.width} height={visual?.height} onError={() => setFailedUrl(imageUrl)}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
    : <p role="status">Chưa có hình ảnh.</p>;

  return createPortal(
    <div className="fbModalBackdrop" onClick={onClose}>
      <div className="fbModalContainer" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1.25rem", borderBottom: "1px solid #3a3b3c", background: "#242526" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.25rem" }}>📱</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#e4e6eb" }}>
              Multi-Platform Publication Preview
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#b0b3b8", fontSize: "1.25rem", cursor: "pointer", padding: "0.2rem" }}
          >
            ✕
          </button>
        </div>

        {/* Platform Selection Tabs */}
        <div className="publicationPreviewTabs" style={{ background: "#1e1f20", borderBottom: "1px solid #3a3b3c" }}>
          <button
            type="button"
            onClick={() => setActiveTab("facebook_feed")}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "facebook_feed" ? "2px solid #1877f2" : "2px solid transparent",
              color: activeTab === "facebook_feed" ? "#fff" : "#b0b3b8",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>🔵</span> Facebook Feed (1:1)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("instagram_feed")}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "instagram_feed" ? "2px solid #e1306c" : "2px solid transparent",
              color: activeTab === "instagram_feed" ? "#fff" : "#b0b3b8",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>📸</span> Instagram Feed (1:1)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("instagram_story")}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "instagram_story" ? "2px solid #e1306c" : "2px solid transparent",
              color: activeTab === "instagram_story" ? "#fff" : "#b0b3b8",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>⚡</span> Instagram Story (9:16)
          </button>
        </div>

        {/* Content Preview Container */}
        <div style={{ background: "#18191a", padding: "1.25rem", maxHeight: "70vh", overflowY: "auto" }}>
          {activeTab === "facebook_feed" && (
            <div style={{ background: "#242526", borderRadius: "0.75rem", border: "1px solid #3a3b3c", overflow: "hidden", maxWidth: "550px", margin: "0 auto" }}>
              {/* FB Header */}
              <div className="fbHeader">
                <div className="fbAvatar">N</div>
                <div style={{ flex: 1 }}>
                  <div className="fbPageName">
                    <span>NovaCommerce</span>
                    <span style={{ color: "#1877f2", fontSize: "0.85rem" }}>✓</span>
                  </div>
                  <div className="fbPostTime">
                    <span>Vừa xong</span>
                    <span>•</span>
                    <span>🌐</span>
                  </div>
                </div>
              </div>

              {/* Post Content */}
              <div className="fbContent">
                {headline && <div style={{ fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>{headline}</div>}
                <div>{bodyText}</div>
                {hashtags.length > 0 && (
                  <div style={{ marginTop: "0.65rem", color: "#4599ff", fontWeight: 600 }}>
                    {hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                  </div>
                )}
              </div>

              <div className="fbImageSection">{imagePreview}</div>

              {/* FB Engagement Bar */}
              <div style={{ padding: "0.5rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8rem", color: "#b0b3b8", borderBottom: "1px solid #3a3b3c" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <span style={{ background: "#1877f2", borderRadius: "50%", width: "18px", height: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "#fff" }}>👍</span>
                  <span style={{ background: "#fa3e3e", borderRadius: "50%", width: "18px", height: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "#fff" }}>❤️</span>
                  <span>256</span>
                </span>
                <span>48 bình luận • 19 lượt chia sẻ</span>
              </div>

              {/* FB Action Bar */}
              <div className="fbActionsBar">
                <button type="button" className="fbActionBtn">👍 Like</button>
                <button type="button" className="fbActionBtn">💬 Comment</button>
                <button type="button" className="fbActionBtn">↗️ Share</button>
              </div>
            </div>
          )}

          {activeTab === "instagram_feed" && (
            <div style={{ background: "#000", borderRadius: "0.75rem", border: "1px solid #262626", overflow: "hidden", maxWidth: "480px", margin: "0 auto" }}>
              {/* IG Header */}
              <div style={{ display: "flex", alignItems: "center", padding: "0.75rem 1rem", gap: "0.75rem" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>
                  NC
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>novacommerce.official</div>
                  <div style={{ color: "#a8a8a8", fontSize: "0.75rem" }}>Sponsored</div>
                </div>
                <span style={{ color: "#fff" }}>•••</span>
              </div>

              <div className="fbImageSection">{imagePreview}</div>

              {/* IG Actions */}
              <div style={{ padding: "0.75rem 1rem", display: "flex", gap: "1rem", color: "#fff", fontSize: "1.2rem" }}>
                <span>🤍</span>
                <span>💬</span>
                <span>↗️</span>
              </div>

              {/* IG Caption */}
              <div style={{ padding: "0 1rem 1rem 1rem", fontSize: "0.85rem", color: "#f5f5f5" }}>
                <strong style={{ marginRight: "0.4rem" }}>novacommerce.official</strong>
                {bodyText}
                {hashtags.length > 0 && (
                  <div style={{ marginTop: "0.5rem", color: "#93c5fd" }}>
                    {hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "instagram_story" && (
            <div style={{ background: "#000", borderRadius: "1.25rem", border: "2px solid #262626", overflow: "hidden", maxWidth: "340px", aspectRatio: "9/16", margin: "0 auto", display: "flex", flexDirection: "column", position: "relative" }}>
              {/* Story Top Progress */}
              <div style={{ padding: "0.75rem 0.75rem 0.25rem 0.75rem", display: "flex", gap: "4px" }}>
                <div style={{ height: "2px", flex: 1, background: "rgba(255,255,255,0.9)", borderRadius: "2px" }} />
              </div>

              {/* Story Header */}
              <div style={{ display: "flex", alignItems: "center", padding: "0.5rem 0.75rem", gap: "0.5rem" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#e1306c", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.75rem" }}>
                  NC
                </div>
                <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.8rem" }}>novacommerce.official</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.75rem" }}>Sponsored</span>
              </div>

              <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{imagePreview}</div>

              {/* Swipe Up Button */}
              <div style={{ padding: "1rem", textAlign: "center" }}>
                <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", color: "#fff", fontSize: "0.8rem", fontWeight: 700 }}>
                  <span>▲</span>
                  <span>{brief?.callToAction ?? "Vuốt Lên Mua Ngay"}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "0.75rem 1.25rem", background: "#242526", borderTop: "1px solid #3a3b3c", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            className="marketingBtnSecondary"
            style={{ fontSize: "0.8rem" }}
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
