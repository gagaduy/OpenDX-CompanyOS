// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MarketingArtifact } from "../types";
import "../styles/marketing.css";

export function MarketingDeliverablesPanel({
  artifacts,
  getDownloadUrl,
}: {
  readonly artifacts: readonly MarketingArtifact[];
  readonly getDownloadUrl: (artifactId: string) => string;
}) {
  const getIconClass = (kind: string) => {
    if (kind.includes("docx")) return "deliverableIcon iconDocx";
    if (kind.includes("png")) return "deliverableIcon iconPng";
    if (kind.includes("xlsx")) return "deliverableIcon iconXlsx";
    if (kind.includes("pdf")) return "deliverableIcon iconPdf";
    return "deliverableIcon iconDocx";
  };

  const getEmoji = (kind: string) => {
    if (kind.includes("docx")) return "📝";
    if (kind.includes("png")) return "🖼️";
    if (kind.includes("xlsx")) return "📊";
    if (kind.includes("pdf")) return "📄";
    return "📦";
  };

  const getLabelForKind = (kind: string) => {
    switch (kind) {
      case "campaign_brief_docx":
        return "1. Bản Mô Tả Chiến Dịch (DOCX)";
      case "facebook_content_docx":
        return "2. Các Phiên Bản Nội Dung Bài Viết (DOCX)";
      case "facebook_visual_png":
        return "3. Ấn Phẩm Hình Ảnh 1:1 Chuẩn Facebook (PNG)";
      case "facebook_publication_log_xlsx":
        return "4. Nhật Ký & Thống Kê Xuất Bản (XLSX)";
      case "marketing_final_report_pdf":
        return "5. Báo Cáo Tổng Kết Chiến Dịch (PDF)";
      default:
        return kind;
    }
  };

  return (
    <div className="sectionCard">
      <div className="sectionCardHeader">
        <h3 className="sectionCardTitle">
          <span>📦</span> Bộ 5 Tài Liệu Bàn Giao Chiến Dịch ({artifacts.length}/5)
        </h3>
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
          Lưu trữ bảo mật trên MinIO S3 & PostgreSQL
        </span>
      </div>

      {artifacts.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#64748b", fontSize: "0.875rem", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "0.75rem" }}>
          Chưa có tài liệu nào được tạo. Nhấn nút <strong>"📦 Xuất bản 5 Deliverables"</strong> ở trên để tự động lắp ráp trọn bộ 5 file tiêu chuẩn.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "0.85rem" }}>
          {artifacts.map((art) => (
            <div key={art.id} className="deliverableItem">
              <div className="deliverableMeta">
                <div className={getIconClass(art.kind)}>
                  {getEmoji(art.kind)}
                </div>
                <div>
                  <div className="deliverableTitle">
                    {getLabelForKind(art.kind)}
                  </div>
                  <div className="deliverableSubtitle">
                    {art.filename} • {(art.byteSize / 1024).toFixed(1)} KB
                  </div>
                  <code style={{ fontSize: "0.7rem", color: "#475569", fontFamily: "monospace", display: "block", marginTop: "0.15rem" }}>
                    SHA: {art.sha256Digest.slice(0, 16)}...
                  </code>
                </div>
              </div>

              <a
                href={getDownloadUrl(art.id)}
                download={art.filename}
                target="_blank"
                rel="noreferrer"
                className="marketingBtnSecondary"
                style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
              >
                Tải về ↓
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
