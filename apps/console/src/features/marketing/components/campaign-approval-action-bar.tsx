// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { MarketingCampaign } from "../types";
import "../styles/marketing.css";

export function CampaignApprovalActionBar({
  campaign,
  onApprove,
  onRequestRevision,
  onGenerateDeliverables,
  onOpenPreview,
  loading = false,
}: {
  readonly campaign: MarketingCampaign;
  readonly onApprove: () => Promise<void>;
  readonly onRequestRevision: (feedback: string) => Promise<void>;
  readonly onGenerateDeliverables: () => Promise<void>;
  readonly onOpenPreview: () => void;
  readonly loading?: boolean;
}) {
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");

  const handleRevisionSubmit = async () => {
    if (!revisionFeedback.trim()) return;
    await onRequestRevision(revisionFeedback);
    setRevisionModalOpen(false);
    setRevisionFeedback("");
  };

  const isAwaitingApproval =
    campaign.state === "campaign_review" ||
    campaign.state === "awaiting_human_approval" ||
    campaign.state === "scheduled";

  return (
    <div className="sectionCard" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "1.15rem 1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Hành động Quản trị:
        </span>
        <span style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
          {isAwaitingApproval ? "Chiến dịch đã sẵn sàng duyệt để đăng lên Fanpage" : "Chiến dịch đang được điều hành tự động"}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={onOpenPreview}
          className="marketingBtnSecondary"
        >
          <span>📱</span> Preview Facebook Post
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={onGenerateDeliverables}
          className="marketingBtnSecondary"
          style={{ borderColor: "rgba(168, 85, 247, 0.3)", color: "#c084fc" }}
        >
          <span>📦</span> Generate Deliverables
        </button>

        {isAwaitingApproval && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => setRevisionModalOpen(true)}
              className="marketingBtnSecondary"
              style={{ borderColor: "rgba(245, 158, 11, 0.3)", color: "#fbbf24" }}
            >
              <span>🔄</span> Request Revision
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={onApprove}
              className="marketingBtnSuccess"
            >
              {loading ? "Đang xử lý..." : "✓ Approve & Publish to Facebook"}
            </button>
          </>
        )}
      </div>

      {/* Revision Modal */}
      {revisionModalOpen && (
        <div className="fbModalBackdrop">
          <div style={{ background: "#131722", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: "1.25rem", maxWidth: "480px", width: "100%", padding: "1.75rem", boxShadow: "0 25px 70px rgba(0,0,0,0.8)" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", margin: "0 0 0.5rem" }}>
              Yêu cầu Nhân sự số Chỉnh sửa
            </h3>
            <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 1rem", lineHeight: 1.5 }}>
              Nhập ghi chú phản hồi cho Marketing Digital Employees (Content & Visual). Hệ thống sẽ kích hoạt lại quy trình soạn thảo theo ý bạn.
            </p>
            <textarea
              rows={4}
              value={revisionFeedback}
              onChange={(e) => setRevisionFeedback(e.target.value)}
              placeholder="VD: Cần nhấn mạnh hơn vào ưu đãi giảm 15% và điều chỉnh hook hào hứng hơn..."
              style={{ width: "100%", padding: "0.75rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                type="button"
                onClick={() => setRevisionModalOpen(false)}
                className="marketingBtnSecondary"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={loading || !revisionFeedback.trim()}
                onClick={handleRevisionSubmit}
                className="marketingBtnPrimary"
              >
                {loading ? "Đang gửi..." : "Gửi yêu cầu chỉnh sửa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
