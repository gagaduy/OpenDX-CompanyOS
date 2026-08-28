// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { createPortal } from "react-dom";
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

  const modalContent = revisionModalOpen && typeof document !== "undefined" ? (
    createPortal(
      <div
        className="fbModalBackdrop"
        onClick={() => setRevisionModalOpen(false)}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(12px)",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          boxSizing: "border-box",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#131722",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            borderRadius: "1.25rem",
            maxWidth: "520px",
            width: "100%",
            padding: "1.75rem",
            boxShadow: "0 25px 80px rgba(0,0,0,0.9)",
            maxHeight: "90vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            color: "#fff",
            zIndex: 100000,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "0.75rem" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>✏️</span> Yêu cầu Chỉnh sửa (Revision)
            </h3>
            <button
              type="button"
              onClick={() => setRevisionModalOpen(false)}
              style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "1.3rem", cursor: "pointer", padding: "0.2rem" }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>
            Nhập ghi chú phản hồi cho <strong>Nhân sự số Marketing</strong> (Content & Visual). Hệ thống sẽ kích hoạt lại quy trình soạn thảo theo ý bạn.
          </p>

          <textarea
            rows={5}
            value={revisionFeedback}
            onChange={(e) => setRevisionFeedback(e.target.value)}
            placeholder="VD: Cần nhấn mạnh hơn vào ưu đãi giảm 15% và điều chỉnh câu mở đầu hấp dẫn hơn..."
            style={{
              width: "100%",
              padding: "0.85rem",
              borderRadius: "0.75rem",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              background: "rgba(0, 0, 0, 0.5)",
              color: "#fff",
              fontSize: "0.875rem",
              lineHeight: 1.5,
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <button
              type="button"
              onClick={() => setRevisionModalOpen(false)}
              className="marketingBtnSecondary"
              style={{ padding: "0.6rem 1.2rem" }}
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={loading || !revisionFeedback.trim()}
              onClick={handleRevisionSubmit}
              className="marketingBtnPrimary"
              style={{ padding: "0.6rem 1.4rem" }}
            >
              {loading ? "Đang gửi..." : "Gửi yêu cầu chỉnh sửa"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  ) : null;

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

      {modalContent}
    </div>
  );
}
