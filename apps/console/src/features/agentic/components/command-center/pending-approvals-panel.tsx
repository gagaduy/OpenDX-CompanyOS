// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {
  FileText,
  Eye,
  Edit3,
  Check,
  X,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import type { PendingApprovalsProps } from "./types";

export const PendingApprovalsPanel: React.FC<PendingApprovalsProps> = ({
  approvals,
  onViewAll,
  maxHeight,
  focusedApprovalId,
}) => {
  return (
    <div className="ccApprovalsCard">
      {/* Header */}
      <div className="ccApprovalsHeader">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <h3 className="ccApprovalsTitle">
            <span>Phê duyệt</span>
          </h3>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "1px 6px", borderRadius: "9999px", fontSize: "0.7rem", fontWeight: 700, background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
            {approvals.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="ccApprovalsViewAll"
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <span>Xem tất cả</span>
          <ArrowRight size={11} />
        </button>
      </div>

      {/* Approvals list */}
      <div
        className="ccApprovalsScrollContainer"
        style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}
      >
        {approvals.length === 0 ? (
          <div style={{ padding: "1.5rem 0", textAlign: "center", fontSize: "0.75rem", color: "#64748b" }}>
            Không có đề xuất nào đang chờ phê duyệt
          </div>
        ) : (
          approvals.map((app) => (
            <div
              key={app.id}
              id={`pending-approval-${app.id}`}
              className={`ccApprovalBox ${focusedApprovalId === app.id ? "is-focused" : ""}`}
              aria-current={focusedApprovalId === app.id ? "true" : undefined}
              onClick={app.onPreview}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  app.onPreview();
                }
              }}
              style={{ cursor: "pointer" }}
              title="Nhấn để xem chi tiết & phê duyệt"
            >
              <div className="ccApprovalTopRow">
                <div className="ccApprovalTitleWrap">
                  <div className="ccApprovalDocIcon">
                    <FileText size={14} />
                  </div>
                  <h4 className="ccApprovalTitle">
                    {app.title}
                  </h4>
                  <span className="ccApprovalNewBadge">
                    Mới
                  </span>
                </div>
                <span className="ccApprovalTime">
                  {app.timestamp}
                </span>
              </div>

              <p className="ccApprovalAuthor">
                Từ: {app.authorName}
              </p>

              {app.riskLevel === "high" && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.68rem", color: "#f87171", fontWeight: 500, marginBottom: "0.4rem", paddingLeft: "2rem" }}>
                  <ShieldAlert size={11} />
                  <span>Hành động rủi ro cao: Yêu cầu xác nhận con người</span>
                </div>
              )}

              {/* Human-in-the-Loop Action buttons */}
              <div className="ccApprovalBtns">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    app.onPreview();
                  }}
                  className="ccApprovalBtnPreview"
                >
                  <Eye size={12} style={{ display: "inline", marginRight: "3px" }} />
                  <span>Xem trước</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    app.onRequestRevision();
                  }}
                  className="ccApprovalBtnEdit"
                >
                  <Edit3 size={12} style={{ display: "inline", marginRight: "3px" }} />
                  <span>Yêu cầu chỉnh sửa</span>
                </button>

                {app.onReject && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      app.onReject?.();
                    }}
                    className="ccApprovalBtnReject"
                  >
                    <X size={12} style={{ display: "inline", marginRight: "3px" }} />
                    <span>Hủy duyệt</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    app.onApprove();
                  }}
                  className="ccApprovalBtnApprove"
                  style={!app.onReject ? { gridColumn: "span 2" } : undefined}
                >
                  <Check size={12} style={{ display: "inline", marginRight: "3px" }} />
                  <span>Phê duyệt</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
