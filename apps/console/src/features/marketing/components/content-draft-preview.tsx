// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ContentVersion } from "../types";
import "../styles/marketing.css";

export function ContentDraftPreview({
  contents,
}: {
  readonly contents: readonly ContentVersion[];
}) {
  if (contents.length === 0) {
    return (
      <div className="sectionCard" style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
        Chưa có bản thảo bài viết nào được tạo.
      </div>
    );
  }

  const latest = contents[contents.length - 1]!;

  return (
    <div className="sectionCard">
      <div className="sectionCardHeader">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h3 className="sectionCardTitle">
            <span>✍️</span> Bản Thảo Nội Dung (Content Copy)
          </h3>
          <span className="statusBadge publishedLive" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}>
            v{latest.versionNumber}
          </span>
        </div>
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
          Số lần chỉnh sửa: {contents.length}
        </span>
      </div>

      {latest.headline && (
        <div style={{ marginBottom: "0.85rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.25rem" }}>
            Tiêu đề Headline:
          </span>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>
            {latest.headline}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
          Nội dung chính bài viết:
        </span>
        <div className="contentCopyBox">
          {latest.body}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        <div>
          <span style={{ color: "#64748b", fontWeight: 600, display: "block" }}>Lời kêu gọi (CTA):</span>
          <span style={{ color: "#60a5fa", fontWeight: 700 }}>{latest.callToAction}</span>
        </div>
        <div>
          <span style={{ color: "#64748b", fontWeight: 600, display: "block" }}>Mã SHA-256 Digest:</span>
          <code style={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "monospace" }}>
            {latest.contentDigest.slice(0, 16)}...
          </code>
        </div>
      </div>

      {latest.hashtags.length > 0 && (
        <div style={{ paddingTop: "0.75rem", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Hashtags chiến dịch:
          </span>
          <div className="hashtagsList">
            {latest.hashtags.map((tag, i) => (
              <span key={i} className="hashtagChip">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
