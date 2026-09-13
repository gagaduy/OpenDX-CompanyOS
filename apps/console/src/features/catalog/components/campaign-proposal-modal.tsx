// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  ImageIcon,
  Loader2,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type { CampaignProposal } from "../api/catalog-api";

export interface CampaignProposalModalProps {
  readonly proposal: CampaignProposal;
  readonly onClose: () => void;
  readonly onApprove?: (options: {
    readonly endDate: string;
    readonly excludedItemIds: readonly string[];
    readonly conflictResolution?: "replace" | "schedule_after";
  }) => Promise<void> | void;
  readonly isActivating?: boolean;
  readonly apiBaseUrl?: string;
  readonly readOnly?: boolean;
}

const ITEMS_PER_PAGE = 4;

export function resolveMediaUrl(url: string | undefined, apiBaseUrl?: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  const base = apiBaseUrl || "http://localhost:4000";
  return `${base.replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function CampaignProposalModal({
  proposal,
  onClose,
  onApprove,
  isActivating = false,
  apiBaseUrl,
  readOnly = false,
}: CampaignProposalModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(proposal.items.map((it) => it.id)),
  );
  const [conflictResolution, setConflictResolution] = useState<"replace" | "schedule_after">("replace");

  const conflictedItems = proposal.items.filter((it) => it.conflictedCampaign);
  const hasConflicts = conflictedItems.length > 0;

  // Duration End Time State (default to proposal.endTime)
  const [endDate, setEndDate] = useState<string>(() => {
    try {
      const d = new Date(proposal.endTime);
      return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    } catch {
      return "";
    }
  });

  const totalPages = Math.max(1, Math.ceil(proposal.items.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentItems = proposal.items.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const toggleItem = (itemId: string) => {
    if (readOnly) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    if (readOnly) return;
    const allSelected = currentItems.every((it) => selectedIds.has(it.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of currentItems) {
        if (allSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  const addPresetDays = (days: number) => {
    if (readOnly) return;
    const next = new Date(Date.now() + days * 24 * 3600 * 1000);
    setEndDate(next.toISOString().slice(0, 16));
  };

  const handleApprove = () => {
    if (!onApprove) return;
    const excluded = proposal.items
      .filter((it) => !selectedIds.has(it.id))
      .map((it) => it.id);

    const finalEndDate = endDate ? new Date(endDate).toISOString() : proposal.endTime;
    void onApprove({
      endDate: finalEndDate,
      excludedItemIds: excluded,
      conflictResolution,
    });
  };

  return (
    <div
      className="ccCampaignModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-modal-title"
    >
      <div className="ccCampaignModalDialog">
        {/* Header */}
        <div className="ccCampaignModalHeader">
          <div className="ccCampaignModalHeaderLeft">
            <span className="ccCampaignModalIcon">
              <Sparkles size={22} color="#ffffff" />
            </span>
            <div>
              <div className="ccCampaignModalTitleRow">
                <h2 id="campaign-modal-title" className="ccCampaignModalTitle">
                  {proposal.name}
                </h2>
                <span className="ccCampaignBadgePill">
                  {proposal.badgeText}
                </span>
                <span className="ccCampaignDiscountPill">
                  -{proposal.discountPercent}%
                </span>
                {proposal.status === "scheduled" && (
                  <span
                    style={{
                      background: "rgba(245, 158, 11, 0.2)",
                      border: "1px solid rgba(245, 158, 11, 0.5)",
                      color: "#fbbf24",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    🗓️ Đã xếp lịch
                  </span>
                )}
              </div>
              <p className="ccCampaignModalSubtitle">
                {readOnly
                  ? "Chiến dịch đang kích hoạt trực tiếp trên Storefront và áp dụng mức giá khuyến mãi"
                  : "Xem trước Thiết Kế Poster & Phê duyệt áp dụng chiến dịch lên Storefront"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ccCampaignModalClose"
            aria-label="Đóng cửa sổ"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="ccCampaignModalBody">
          {/* Executive & Sales Rationale */}
          <div className="ccCampaignSummaryGrid">
            <div className="ccCampaignSummaryCard">
              <div className="ccCampaignSummaryLabel pricing">
                <Clock size={14} />
                Chiến lược định giá & Biên lợi nhuận
              </div>
              <p className="ccCampaignSummaryText">
                {proposal.pricingRationale}
              </p>
            </div>
            <div className="ccCampaignSummaryCard">
              <div className="ccCampaignSummaryLabel sales">
                <TrendingUp size={14} />
                Dự báo tăng trưởng doanh thu
              </div>
              <p className="ccCampaignSummaryText">
                {proposal.salesProjection}
              </p>
            </div>
          </div>

          {/* Time Window Duration Selector */}
          <div className="ccCampaignDurationBar">
            <div className="ccCampaignDurationLeft">
              <Calendar size={16} color="#818cf8" />
              <span>
                Thời hạn chiến dịch (Tự động hoàn nguyên giá gốc khi kết thúc):
              </span>
            </div>
            <div className="ccCampaignDurationControls">
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="ccCampaignDatetimeInput"
                aria-label="Thời gian kết thúc chiến dịch"
              />
              <button
                type="button"
                onClick={() => addPresetDays(1)}
                className="ccCampaignPresetBtn"
              >
                +1 ngày
              </button>
              <button
                type="button"
                onClick={() => addPresetDays(3)}
                className="ccCampaignPresetBtn"
              >
                +3 ngày
              </button>
              <button
                type="button"
                onClick={() => addPresetDays(5)}
                className="ccCampaignPresetBtn"
              >
                +5 ngày
              </button>
              <button
                type="button"
                onClick={() => addPresetDays(7)}
                className="ccCampaignPresetBtn"
              >
                +7 ngày
              </button>
            </div>
          </div>

          {/* Conflict Resolution Settings (if any items conflict with existing active campaigns) */}
          {hasConflicts && !readOnly && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                borderRadius: "10px",
                padding: "14px 16px",
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fbbf24", fontWeight: 600, fontSize: "13px" }}>
                <AlertTriangle size={16} color="#f59e0b" />
                <span>
                  Phát hiện {conflictedItems.length} sản phẩm trùng với chiến dịch đang chạy. Vui lòng chọn chính sách xử lý:
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    background: conflictResolution === "replace" ? "rgba(99, 102, 241, 0.15)" : "rgba(30, 41, 59, 0.6)",
                    border: `1px solid ${conflictResolution === "replace" ? "#6366f1" : "rgba(148, 163, 184, 0.2)"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="replace"
                    checked={conflictResolution === "replace"}
                    onChange={() => setConflictResolution("replace")}
                    style={{ marginTop: "3px", accentColor: "#6366f1", cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ color: "#f8fafc", fontWeight: 600, fontSize: "13px" }}>
                      ⚡ Ghi đè & kích hoạt ngay (Khuyên dùng)
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px", lineHeight: "1.35" }}>
                      Hết hạn giá cũ trên các sản phẩm trùng để không bị giảm giá kép (-36%). Áp dụng giá mới ngay.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    background: conflictResolution === "schedule_after" ? "rgba(99, 102, 241, 0.15)" : "rgba(30, 41, 59, 0.6)",
                    border: `1px solid ${conflictResolution === "schedule_after" ? "#6366f1" : "rgba(148, 163, 184, 0.2)"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="schedule_after"
                    checked={conflictResolution === "schedule_after"}
                    onChange={() => setConflictResolution("schedule_after")}
                    style={{ marginTop: "3px", accentColor: "#6366f1", cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ color: "#f8fafc", fontWeight: 600, fontSize: "13px" }}>
                      🗓️ Xếp lịch sau khi chiến dịch cũ hết hạn
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px", lineHeight: "1.35" }}>
                      Tự động xếp lịch chờ (Scheduled). Sẽ tự động áp dụng giá và poster ngay khi chiến dịch cũ kết thúc.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Products Review List Header & Pagination Controls */}
          <div className="ccCampaignListHeader">
            <div style={{ display: "flex", alignItems: "center" }}>
              <span className="ccCampaignListTitle">
                Danh sách sản phẩm áp dụng ({selectedIds.size}/{proposal.items.length} đã chọn)
              </span>
              <button
                type="button"
                onClick={handleSelectAllOnPage}
                className="ccCampaignSelectAllBtn"
              >
                Chọn / Bỏ chọn trang này
              </button>
            </div>

            {/* Pagination Controls */}
            <div className="ccCampaignPaginationControls">
              <span>
                Trang {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Trang trước"
                className="ccCampaignPageBtn"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Trang sau"
                className="ccCampaignPageBtn"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Paginated Product Rows */}
          <div className="ccCampaignProductsList">
            {currentItems.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const origUrl = resolveMediaUrl(item.originalMediaUrl, apiBaseUrl);
              const campUrl = resolveMediaUrl(item.campaignMediaUrl, apiBaseUrl);

              return (
                <div
                  key={item.id}
                  className={`ccCampaignProductRow ${isSelected ? "selected" : "unselected"}`}
                >
                  {/* Selection Checkbox */}
                  <div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItem(item.id)}
                      className="ccCampaignCheckbox"
                      aria-label={`Chọn sản phẩm ${item.productName}`}
                    />
                  </div>

                  {/* Before & After Visual Synthesis Comparison */}
                  <div className="ccCampaignVisualCompare">
                    {/* Before: Raw photo */}
                    <div className="ccCampaignThumbWrapper">
                      <div className="ccCampaignThumb">
                        {origUrl ? (
                          <img
                            src={origUrl}
                            alt={`Gốc: ${item.productName}`}
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = "0.3";
                            }}
                          />
                        ) : (
                          <ImageIcon size={22} color="#64748b" />
                        )}
                      </div>
                      <span className="ccCampaignThumbLabel">Ảnh gốc</span>
                    </div>

                    <span className="ccCampaignCompareArrow">➔</span>

                    {/* After: Synthesized 3D Badge Overlay photo */}
                    <div className="ccCampaignThumbWrapper">
                      <div className="ccCampaignThumb aiGenerated">
                        {campUrl ? (
                          <img
                            src={campUrl}
                            alt={`Thiết kế Poster: ${item.productName}`}
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = "0.3";
                            }}
                          />
                        ) : (
                          <Sparkles size={22} color="#818cf8" />
                        )}
                      </div>
                      <span className="ccCampaignThumbLabel aiGenerated">
                        Thiết kế bởi Đội Tiếp thị & Sáng tạo
                      </span>
                    </div>
                  </div>

                  {/* Information & Price Details */}
                  <div className="ccCampaignProductInfo">
                    <div className="ccCampaignProductTitleRow">
                      <h4 className="ccCampaignProductName">
                        {item.productName}
                      </h4>
                      <span className="ccCampaignItemBadge">
                        {item.badge}
                      </span>
                    </div>

                    <p className="ccCampaignSeoTitle">
                      Tiêu đề SEO: {item.optimizedTitle}
                    </p>

                    <p className="ccCampaignSeoDesc">
                      {item.optimizedDescription}
                    </p>

                    {item.conflictedCampaign && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "6px 10px",
                          background: "rgba(245, 158, 11, 0.12)",
                          border: "1px solid rgba(245, 158, 11, 0.35)",
                          borderRadius: "6px",
                          fontSize: "12px",
                          color: "#fbbf24",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          lineHeight: "1.4",
                        }}
                      >
                        <AlertTriangle size={14} style={{ flexShrink: 0, color: "#f59e0b" }} />
                        <span>
                          ⚠️ Đang trong chiến dịch <strong>&ldquo;{item.conflictedCampaign.name}&rdquo;</strong> (còn {item.conflictedCampaign.remainingDays} ngày). Bỏ chọn nếu muốn giữ chiến dịch cũ.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Price Comparison */}
                  <div className="ccCampaignProductPriceBlock">
                    <span className="ccCampaignOrigPrice">
                      {item.originalPriceVnd.toLocaleString("vi-VN")} ₫
                    </span>
                    <span className="ccCampaignNewPrice">
                      {item.campaignPriceVnd.toLocaleString("vi-VN")} ₫
                    </span>
                    <span className="ccCampaignSavingPill">
                      Tiết kiệm: -{item.savingAmountVnd.toLocaleString("vi-VN")} ₫ (-{item.discountPercent}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="ccCampaignModalFooter">
          <div className="ccCampaignFooterSummary">
            {readOnly ? (
              <>
                Chiến dịch đang kích hoạt trên Storefront với <strong>{selectedIds.size}</strong> sản phẩm.
              </>
            ) : hasConflicts && conflictResolution === "schedule_after" ? (
              <>
                Sẽ xếp lịch chờ cho <strong>{selectedIds.size}</strong> sản phẩm (tự động kích hoạt khi chiến dịch cũ kết thúc).
              </>
            ) : (
              <>
                Sẽ áp dụng cho <strong>{selectedIds.size}</strong> sản phẩm. Giá sẽ tự động hoàn nguyên khi hết hạn.
              </>
            )}
          </div>

          <div className="ccCampaignFooterActions">
            {readOnly ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="ccCampaignCancelBtn"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => window.open("http://localhost:3100", "_blank")}
                  className="ccCampaignApproveBtn"
                  style={{
                    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    borderColor: "#3b82f6",
                  }}
                >
                  <ExternalLink size={16} />
                  Mở Storefront xem trực tiếp
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isActivating}
                  className="ccCampaignCancelBtn"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={selectedIds.size === 0 || isActivating}
                  className="ccCampaignApproveBtn"
                >
                  {isActivating ? (
                    <>
                      <Loader2 size={16} className="ccSpin" />
                      {hasConflicts && conflictResolution === "schedule_after"
                        ? "Đang xếp lịch chiến dịch..."
                        : "Đang kích hoạt chiến dịch..."}
                    </>
                  ) : hasConflicts && conflictResolution === "schedule_after" ? (
                    <>
                      <Check size={16} />
                      Phê duyệt & Xếp lịch chiến dịch
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Phê duyệt & Kích hoạt chiến dịch
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
