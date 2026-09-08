// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CampaignBrief } from "../types";
import "../styles/marketing.css";

export function CampaignBriefCard({ brief }: { readonly brief: CampaignBrief | null }) {
  if (!brief) {
    return (
      <div className="sectionCard" style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
        Chưa có bản mô tả chiến dịch (Brief).
      </div>
    );
  }

  return (
    <div className="sectionCard">
      <div className="sectionCardHeader">
        <div>
          <h3 className="sectionCardTitle">
            <span>📋</span> {brief.campaignName}
          </h3>
          <p className="briefSubtitle">
            Sản phẩm mục tiêu: <strong className="briefSubjectText">{brief.subjectKind} ({brief.subjectReference})</strong>
          </p>
        </div>
        <span className="statusBadge drafting" style={{ fontSize: "0.8rem" }}>
          Fanpage ID: {brief.facebookPageConfigurationId}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem", fontSize: "0.875rem" }}>
        <div>
          <span className="briefSectionLabel">
            🎯 Mục tiêu chiến dịch
          </span>
          <p className="briefObjectiveText">{brief.objective}</p>
        </div>

        <div>
          <span className="briefSectionLabel mandatory">
            ✅ Thông điệp bắt buộc
          </span>
          <div className="briefMandatoryBox">
            {brief.mandatoryMessage}
          </div>
        </div>

        <div>
          <span className="briefSectionLabel">
            👥 Đối tượng & Giọng điệu
          </span>
          <p className="briefAudienceText">
            {brief.audience ?? "Đại chúng"} • {brief.tone ?? "Chuyên nghiệp"} ({brief.language.toUpperCase()})
          </p>
        </div>

        <div>
          <span className="briefSectionLabel">
            👉 Lời kêu gọi hành động (CTA)
          </span>
          <p className="briefCtaText">
            {brief.callToAction}
          </p>
        </div>
      </div>

      {brief.prohibitedClaims.length > 0 && (
        <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.5rem" }}>
            🚫 Tuyên bố cấm (Prohibited Claims - Kiểm duyệt nghiêm ngặt)
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {brief.prohibitedClaims.map((claim, idx) => (
              <span
                key={idx}
                style={{ padding: "0.25rem 0.65rem", borderRadius: "9999px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", fontSize: "0.75rem", fontWeight: 600 }}
              >
                🚫 {claim}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
