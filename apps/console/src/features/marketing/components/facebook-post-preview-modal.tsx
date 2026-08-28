// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CampaignBrief, ContentVersion, VisualAsset } from "../types";
import "../styles/marketing.css";

export function FacebookPostPreviewModal({
  isOpen,
  onClose,
  brief,
  content,
  visual,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly brief: CampaignBrief | null;
  readonly content: ContentVersion | null;
  readonly visual: VisualAsset | null;
}) {
  if (!isOpen) return null;

  const bodyText = content?.primaryText ?? content?.body ?? "Chưa có nội dung bài viết.";
  const headline = content?.headline;
  const hashtags = content?.hashtags ?? [];

  return (
    <div className="fbModalBackdrop" onClick={onClose}>
      <div className="fbModalContainer" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1.25rem", borderBottom: "1px solid #3a3b3c", background: "#242526" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.25rem" }}>📱</span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#e4e6eb" }}>
              Facebook Page Live Feed Mockup
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

        {/* Facebook Post Box */}
        <div style={{ background: "#18191a", padding: "1.25rem" }}>
          <div style={{ background: "#242526", borderRadius: "0.75rem", border: "1px solid #3a3b3c", overflow: "hidden" }}>
            {/* FB Header */}
            <div className="fbHeader">
              <div className="fbAvatar">
                N
              </div>
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

            {/* 1:1 Image Preview Frame */}
            <div className="fbImageSection">
              <div style={{ width: "100%", height: "100%", background: "radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
                <span style={{ fontSize: "4rem", marginBottom: "0.75rem", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.6))" }}>✨ 📱 ✨</span>
                <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>
                  {visual?.altText ?? brief?.campaignName ?? "Ấn Phẩm NovaCommerce"}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#38bdf8", marginTop: "0.35rem", fontWeight: 600 }}>
                  1:1 Square PNG Graphic ({visual?.width ?? 1080} × {visual?.height ?? 1080})
                </span>
              </div>
            </div>

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
    </div>
  );
}
