// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VisualAsset } from "../types";
import "../styles/marketing.css";

export function VisualAssetPreview({
  visuals,
}: {
  readonly visuals: readonly VisualAsset[];
}) {
  if (visuals.length === 0) {
    return (
      <div className="sectionCard" style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
        Chưa có thiết kế hình ảnh nào được tạo.
      </div>
    );
  }

  const latest = visuals[visuals.length - 1]!;

  return (
    <div className="sectionCard">
      <div className="sectionCardHeader">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h3 className="sectionCardTitle">
            <span>🖼️</span> Thiết Kế Hình Ảnh (Visual Graphic)
          </h3>
          <span className="statusBadge" style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", borderColor: "rgba(168, 85, 247, 0.3)", fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}>
            {latest.aspectRatio} Square ({latest.width}x{latest.height})
          </span>
        </div>
        <span style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
          {(latest.byteSize / 1024).toFixed(1)} KB
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div className="visualPreviewFrame" style={{ minHeight: "220px" }}>
          <div className="visualFrameBadge">
            1080 × 1080 PNG (1:1)
          </div>
          <div style={{ fontSize: "3.5rem", marginBottom: "0.5rem", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}>
            ✨ 📱 ✨
          </div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
            {latest.altText || "Ảnh Quảng Bá Sản Phẩm NovaCommerce"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.25rem" }}>
            Chuẩn hóa định dạng RGBA cho Meta Graph API
          </div>
        </div>

        <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.8rem" }}>
            <div>
              <span style={{ color: "#64748b", fontWeight: 600, display: "block" }}>Định dạng Media:</span>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{latest.mediaType} (Pure Node.js RGBA)</span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontWeight: 600, display: "block" }}>Mã SHA-256 Ảnh:</span>
              <code style={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "monospace" }}>
                {latest.imageDigest.slice(0, 16)}...
              </code>
            </div>
          </div>
          <div style={{ marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "0.75rem", color: "#64748b" }}>
            Đường dẫn lưu trữ: <code style={{ color: "#94a3b8" }}>{latest.storageKey}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
