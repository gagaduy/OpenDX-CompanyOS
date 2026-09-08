// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VisualAsset } from "../types";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import "../styles/marketing.css";

export function VisualAssetPreview({
  visuals,
  imageUrl,
  loading,
  error,
  onRetry,
}: {
  readonly visuals: readonly VisualAsset[];
  readonly imageUrl?: string;
  readonly loading: boolean;
  readonly error: boolean;
  readonly onRetry: () => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
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
      <div className="sectionCardHeader" style={{ flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <h3 className="sectionCardTitle">
            <span>🖼️</span> Thiết Kế Hình Ảnh (Visual Graphic)
          </h3>
          <span className="statusBadge" style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", borderColor: "rgba(168, 85, 247, 0.3)", fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}>
            {latest.aspectRatio} ({latest.width}x{latest.height})
          </span>
        </div>
        <span style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
          {(latest.byteSize / 1024).toFixed(1)} KB
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div className="visualPreviewFrame" style={{ aspectRatio: `${latest.width} / ${latest.height}` }}>
          {loading ? <p role="status">Đang tải hình ảnh...</p> : error || (imageUrl && failedUrl === imageUrl) ? (
            <div role="alert">
              <p>Không tải được hình ảnh.</p>
              <button type="button" className="marketingBtnSecondary" onClick={onRetry} title="Tải lại hình ảnh" aria-label="Tải lại hình ảnh">
                <RefreshCw size={16} />
              </button>
            </div>
          ) : imageUrl ? (
            <img src={imageUrl} alt={latest.altText || "Hình ảnh chiến dịch"}
              width={latest.width} height={latest.height} onError={() => setFailedUrl(imageUrl)} />
          ) : <p role="status">Chưa tải được hình ảnh.</p>}
        </div>

        <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.8rem" }}>
            <div>
              <span style={{ color: "#64748b", fontWeight: 600, display: "block" }}>Định dạng Media:</span>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{latest.mediaType}</span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontWeight: 600, display: "block" }}>Mã SHA-256 Ảnh:</span>
              <code style={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "monospace" }}>
                {latest.imageDigest.slice(0, 16)}...
              </code>
            </div>
          </div>
          <div style={{ marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "0.75rem", color: "#64748b" }}>
            Đường dẫn lưu trữ: <code style={{ color: "#94a3b8", overflowWrap: "anywhere" }}>{latest.storageKey}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
