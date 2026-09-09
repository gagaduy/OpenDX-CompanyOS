// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useId } from "react";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Sparkles,
  TrendingUp,
  X,
  ImageIcon,
} from "lucide-react";
import type { CampaignProposal } from "../api/catalog-api";

export interface CampaignProposalModalProps {
  readonly proposal: CampaignProposal;
  readonly onClose: () => void;
  readonly onApprove: (options: { readonly endDate: string; readonly excludedItemIds: readonly string[] }) => Promise<void> | void;
  readonly isActivating?: boolean;
}

const ITEMS_PER_PAGE = 4;

export function CampaignProposalModal({
  proposal,
  onClose,
  onApprove,
  isActivating = false,
}: CampaignProposalModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(proposal.items.map((it) => it.id)),
  );

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
    const next = new Date(Date.now() + days * 24 * 3600 * 1000);
    setEndDate(next.toISOString().slice(0, 16));
  };

  const handleApprove = () => {
    const excluded = proposal.items
      .filter((it) => !selectedIds.has(it.id))
      .map((it) => it.id);

    const finalEndDate = endDate ? new Date(endDate).toISOString() : proposal.endTime;
    void onApprove({ endDate: finalEndDate, excludedItemIds: excluded });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-modal-title"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="campaign-modal-title" className="text-lg font-bold text-white tracking-wide">
                  {proposal.name}
                </h2>
                <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
                  {proposal.badgeText}
                </span>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  -{proposal.discountPercent}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Đề xuất chiến dịch định giá & tối ưu hóa đa phương thức tự động
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="Đóng cửa sổ"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Executive & Sales Rationale */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1.5">
                <Clock className="h-4 w-4 text-indigo-400" />
                Chiến lược định giá & Biên lợi nhuận
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {proposal.pricingRationale}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Dự báo tăng trưởng doanh thu
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {proposal.salesProjection}
              </p>
            </div>
          </div>

          {/* Time Window Duration Selector */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-medium text-slate-300">
                Thời hạn chiến dịch (Tự động hoàn nguyên giá gốc khi kết thúc):
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1">
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 outline-none"
                  aria-label="Thời gian kết thúc chiến dịch"
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => addPresetDays(1)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  +1 ngày
                </button>
                <button
                  type="button"
                  onClick={() => addPresetDays(3)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  +3 ngày
                </button>
                <button
                  type="button"
                  onClick={() => addPresetDays(7)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  +7 ngày
                </button>
              </div>
            </div>
          </div>

          {/* Products Review List Header & Pagination Controls */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-200">
                Danh sách sản phẩm áp dụng ({selectedIds.size}/{proposal.items.length} đã chọn)
              </h3>
              <button
                type="button"
                onClick={handleSelectAllOnPage}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                Chọn / Bỏ chọn trang này
              </button>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Trang trước"
                className="rounded-lg border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Trang sau"
                className="rounded-lg border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Paginated Product Cards */}
          <div className="space-y-4">
            {currentItems.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition-all p-4 ${
                    isSelected
                      ? "border-indigo-500/50 bg-slate-800/60 shadow-lg shadow-indigo-950/20"
                      : "border-slate-800/80 bg-slate-900/40 opacity-70"
                  }`}
                >
                  <div className="flex flex-col md:flex-row items-start gap-4">
                    {/* Selection Checkbox */}
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(item.id)}
                        className="h-4 w-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 cursor-pointer"
                        aria-label={`Chọn sản phẩm ${item.productName}`}
                      />
                    </div>

                    {/* Before & After Visual Synthesis Comparison */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Before: Raw photo */}
                      <div className="flex flex-col items-center">
                        <div className="relative h-20 w-20 rounded-lg border border-slate-700 bg-slate-950 overflow-hidden flex items-center justify-center">
                          {item.originalMediaUrl ? (
                            <img
                              src={item.originalMediaUrl}
                              alt={`Gốc: ${item.productName}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-slate-600" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1">Ảnh gốc</span>
                      </div>

                      <span className="text-slate-500 font-bold">➔</span>

                      {/* After: Synthesized 3D Badge Overlay photo */}
                      <div className="flex flex-col items-center">
                        <div className="relative h-20 w-20 rounded-lg border border-indigo-500/60 bg-slate-950 overflow-hidden flex items-center justify-center ring-2 ring-indigo-500/30">
                          {item.campaignMediaUrl ? (
                            <img
                              src={item.campaignMediaUrl}
                              alt={`AI Đồ họa: ${item.productName}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-1 text-center">
                              <Sparkles className="h-4 w-4 text-indigo-400 mb-0.5" />
                              <span className="text-[9px] text-indigo-300 font-semibold leading-tight">
                                {item.badge}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-indigo-400 font-semibold mt-1">
                          Đồ họa AI
                        </span>
                      </div>
                    </div>

                    {/* Information & Price Details */}
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-white truncate">
                          {item.productName}
                        </h4>
                        <span className="rounded-md bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
                          {item.badge}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 font-medium line-clamp-1">
                        Tiêu đề SEO: {item.optimizedTitle}
                      </p>

                      <p className="text-xs text-slate-400 line-clamp-2">
                        {item.optimizedDescription}
                      </p>

                      {/* Price Comparison */}
                      <div className="flex items-center gap-3 pt-1 text-xs">
                        <span className="text-slate-400 line-through">
                          {item.originalPriceVnd.toLocaleString("vi-VN")} ₫
                        </span>
                        <span className="text-emerald-400 font-bold text-sm">
                          {item.campaignPriceVnd.toLocaleString("vi-VN")} ₫
                        </span>
                        <span className="text-rose-400 font-semibold">
                          Tiết kiệm: -{item.savingAmountVnd.toLocaleString("vi-VN")} ₫ (-{item.discountPercent}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/70 px-6 py-4">
          <div className="text-xs text-slate-400">
            Sẽ áp dụng cho <strong className="text-white">{selectedIds.size}</strong> sản phẩm. Giá sẽ tự động hoàn nguyên khi hết hạn.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isActivating}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={selectedIds.size === 0 || isActivating}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isActivating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang kích hoạt chiến dịch...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Phê duyệt & Kích hoạt chiến dịch
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
