// apps/console/src/features/agentic/components/command-center/support-email-campaign-approval-modal.tsx
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from "react";
import {
  Check,
  CheckSquare,
  Download,
  FileText,
  Mail,
  Megaphone,
  Send,
  Square,
  Tag,
  Users,
  X,
} from "lucide-react";
import type { SupportEmailCampaignProposalView } from "../../../support/types/support.types";

export interface SupportEmailCampaignApprovalModalProps {
  readonly isOpen: boolean;
  readonly proposal: SupportEmailCampaignProposalView | null;
  readonly isSubmitting?: boolean;
  readonly onClose: () => void;
  readonly onApprove: (selectedRecipientIds: readonly string[]) => void | Promise<void>;
  readonly onReject: () => void | Promise<void>;
  readonly onDownloadDocx: () => void | Promise<void>;
}

export const SupportEmailCampaignApprovalModal: React.FC<SupportEmailCampaignApprovalModalProps> = ({
  isOpen,
  proposal,
  isSubmitting = false,
  onClose,
  onApprove,
  onReject,
  onDownloadDocx,
}) => {
  const [activeTab, setActiveTab] = useState<"preview" | "recipients">("preview");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!proposal) return;
    const initialSelected = new Set(
      proposal.recipients.filter((r) => r.isSelected).map((r) => r.customerId),
    );
    setSelectedIds(initialSelected);
    setActiveTab("preview");
  }, [proposal?.id, proposal?.recipients]);

  if (!isOpen || !proposal) return null;

  const totalRecipients = proposal.recipients.length;
  const selectedCount = selectedIds.size;
  const isAllSelected = totalRecipients > 0 && selectedCount === totalRecipients;
  const isSent = proposal.status === "sent" || proposal.status === "partially_sent";
  const isRejected = proposal.status === "rejected";

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(proposal.recipients.map((r) => r.customerId)));
    }
  };

  const toggleRecipient = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const typeLabels: Record<string, string> = {
    new_product_announcement: "Sản phẩm mới",
    promotion_announcement: "Khuyến mãi & Flash Sale",
    customer_care_vip: "Tri ân VIP",
    ticket_resolution: "Hỗ trợ khách hàng",
  };

  const segmentLabels: Record<string, string> = {
    vip_customers: "Khách hàng VIP",
    recent_buyers: "Khách mua gần đây",
    all_active_customers: "Tất cả khách hàng",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "960px",
          maxHeight: "90vh",
          backgroundColor: "#0d0e12",
          border: "1px solid #272a38",
          borderRadius: "14px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          color: "#f8fafc",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #1e2029",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            background: "linear-gradient(180deg, #13151d 0%, #0d0e12 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                backgroundColor: "rgba(94, 106, 210, 0.15)",
                border: "1px solid rgba(94, 106, 210, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7983ff",
                flexShrink: 0,
              }}
            >
              <Megaphone size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
                  {proposal.title}
                </h2>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: isSent
                      ? "rgba(34, 197, 94, 0.15)"
                      : isRejected
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(234, 179, 8, 0.15)",
                    color: isSent ? "#4ade80" : isRejected ? "#f87171" : "#facc15",
                    border: `1px solid ${
                      isSent
                        ? "rgba(34, 197, 94, 0.3)"
                        : isRejected
                          ? "rgba(239, 68, 68, 0.3)"
                          : "rgba(234, 179, 8, 0.3)"
                    }`,
                  }}
                >
                  {isSent ? "Đã gửi" : isRejected ? "Đã từ chối" : "Chờ phê duyệt"}
                </span>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    backgroundColor: "#1e2230",
                    color: "#94a3b8",
                  }}
                >
                  {typeLabels[proposal.type] || proposal.type}
                </span>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    backgroundColor: "#1e2230",
                    color: "#94a3b8",
                  }}
                >
                  {segmentLabels[proposal.targetSegment] || proposal.targetSegment}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "6px" }}>
                Tiêu đề email: <strong style={{ color: "#cbd5e1" }}>{proposal.emailSubject}</strong>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            padding: "0 24px",
            borderBottom: "1px solid #1e2029",
            display: "flex",
            gap: "20px",
            backgroundColor: "#0d0e12",
          }}
        >
          <button
            onClick={() => setActiveTab("preview")}
            style={{
              padding: "12px 4px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "preview" ? "2px solid #5e6ad2" : "2px solid transparent",
              color: activeTab === "preview" ? "#ffffff" : "#94a3b8",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Mail size={16} />
            Xem trước Email
          </button>
          <button
            onClick={() => setActiveTab("recipients")}
            style={{
              padding: "12px 4px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "recipients" ? "2px solid #5e6ad2" : "2px solid transparent",
              color: activeTab === "recipients" ? "#ffffff" : "#94a3b8",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Users size={16} />
            Danh sách người nhận ({selectedCount}/{totalRecipients})
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {activeTab === "preview" ? (
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#94a3b8",
                  marginBottom: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Bản xem trước nội dung email HTML gửi đến khách hàng:</span>
                <span style={{ color: "#5e6ad2" }}>Đã nhúng mẫu giao diện chuẩn Responsive</span>
              </div>
              <div
                style={{
                  border: "1px solid #272a38",
                  borderRadius: "10px",
                  overflow: "hidden",
                  backgroundColor: "#ffffff",
                  minHeight: "420px",
                }}
              >
                <iframe
                  title="Email HTML Preview"
                  srcDoc={proposal.htmlContent}
                  style={{
                    width: "100%",
                    height: "460px",
                    border: "none",
                    display: "block",
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "14px",
                }}
              >
                <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                  Chọn khách hàng mục tiêu sẽ nhận email chiến dịch:
                </span>
                <button
                  onClick={toggleSelectAll}
                  disabled={isSent || isRejected}
                  style={{
                    background: "rgba(94, 106, 210, 0.15)",
                    border: "1px solid rgba(94, 106, 210, 0.3)",
                    color: "#7983ff",
                    borderRadius: "6px",
                    padding: "6px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isAllSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              </div>

              <div
                style={{
                  border: "1px solid #1e2029",
                  borderRadius: "8px",
                  overflow: "hidden",
                  backgroundColor: "#13151d",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#181a24", borderBottom: "1px solid #272a38", textAlign: "left" }}>
                      <th style={{ padding: "10px 14px", width: "40px" }}></th>
                      <th style={{ padding: "10px 14px", color: "#94a3b8", fontWeight: 600 }}>Khách hàng</th>
                      <th style={{ padding: "10px 14px", color: "#94a3b8", fontWeight: 600 }}>Email</th>
                      <th style={{ padding: "10px 14px", color: "#94a3b8", fontWeight: 600, textAlign: "center" }}>Đơn hàng</th>
                      <th style={{ padding: "10px 14px", color: "#94a3b8", fontWeight: 600, textAlign: "right" }}>Tổng chi tiêu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.recipients.map((rec) => {
                      const isSelected = selectedIds.has(rec.customerId);
                      return (
                        <tr
                          key={rec.customerId}
                          style={{
                            borderBottom: "1px solid #1e2029",
                            backgroundColor: isSelected ? "rgba(94, 106, 210, 0.05)" : "transparent",
                          }}
                        >
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isSent || isRejected}
                              onChange={() => toggleRecipient(rec.customerId)}
                              style={{ cursor: "pointer", accentColor: "#5e6ad2" }}
                            />
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: "#f8fafc" }}>
                            {rec.fullName}
                          </td>
                          <td style={{ padding: "10px 14px", color: "#cbd5e1" }}>
                            {rec.email}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#94a3b8" }}>
                            {rec.orderCount}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "#4ade80" }}>
                            {rec.totalSpentVnd.toLocaleString("vi-VN")} đ
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #1e2029",
            backgroundColor: "#13151d",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <button
            onClick={onDownloadDocx}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid #272a38",
              color: "#e2e8f0",
              borderRadius: "8px",
              padding: "9px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FileText size={16} />
            Tải Kế Hoạch Word (.docx)
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={onReject}
              disabled={isSubmitting || isSent || isRejected}
              style={{
                background: "transparent",
                border: "1px solid #374151",
                color: "#9ca3af",
                borderRadius: "8px",
                padding: "9px 18px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: isSubmitting || isSent || isRejected ? "not-allowed" : "pointer",
                opacity: isSubmitting || isSent || isRejected ? 0.5 : 1,
              }}
            >
              Từ chối
            </button>
            <button
              onClick={() => onApprove(Array.from(selectedIds))}
              disabled={isSubmitting || selectedCount === 0 || isSent || isRejected}
              style={{
                background: "linear-gradient(135deg, #5e6ad2 0%, #4b55be 100%)",
                border: "none",
                color: "#ffffff",
                borderRadius: "8px",
                padding: "9px 20px",
                fontSize: "13px",
                fontWeight: 700,
                cursor:
                  isSubmitting || selectedCount === 0 || isSent || isRejected
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  isSubmitting || selectedCount === 0 || isSent || isRejected ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 2px 6px rgba(94, 106, 210, 0.4)",
              }}
            >
              <Send size={15} />
              {isSubmitting
                ? "Đang gửi email..."
                : `Phê duyệt & Gửi Email (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
