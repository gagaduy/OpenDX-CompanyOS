// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Clock,
  Flame,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { ActiveCampaign } from "../api/catalog-api";

export interface ActiveCampaignWidgetProps {
  readonly campaign: ActiveCampaign;
  readonly onRevert: (campaignId: string) => Promise<void> | void;
  readonly isReverting?: boolean;
}

export function ActiveCampaignWidget({
  campaign,
  onRevert,
  isReverting = false,
}: ActiveCampaignWidgetProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const end = new Date(campaign.endTime).getTime();
    return Math.max(0, end - Date.now());
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const end = new Date(campaign.endTime).getTime();
      const diff = Math.max(0, end - Date.now());
      setRemainingMs(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [campaign.endTime]);

  const totalDurationMs = Math.max(
    1,
    new Date(campaign.endTime).getTime() - new Date(campaign.startTime).getTime(),
  );
  const percentElapsed = Math.min(
    100,
    Math.max(0, ((totalDurationMs - remainingMs) / totalDurationMs) * 100),
  );

  const formatCountdown = (ms: number) => {
    if (ms <= 0) return "00:00:00 (Hết hạn)";
    const days = Math.floor(ms / (24 * 3600 * 1000));
    const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
    const minutes = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((ms % (60 * 1000)) / 1000);

    const pad = (n: number) => String(n).padStart(2, "0");
    if (days > 0) {
      return `${days} ngày ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const handleConfirmRevert = () => {
    void onRevert(campaign.id);
    setShowConfirm(false);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-slate-900/80 to-purple-950/40 p-4 shadow-xl shadow-rose-950/20 backdrop-blur-sm">
      {/* Background Accent Glow */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-rose-500/10 blur-2xl pointer-events-none" />

      <div className="flex flex-col gap-3">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Flame className="h-4 w-4 animate-pulse text-rose-400" />
            </span>
            <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
              Chiến dịch đang kích hoạt
            </span>
            <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
              {campaign.badgeText}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
              -{campaign.discountPercent}%
            </span>
            <span className="text-xs text-slate-400">
              {campaign.totalProducts} sản phẩm
            </span>
          </div>
        </div>

        {/* Campaign Name */}
        <div className="text-sm font-bold text-white tracking-wide">
          {campaign.name}
        </div>

        {/* Countdown Timer Display */}
        <div className="flex items-center justify-between rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Clock className="h-4 w-4 text-rose-400" />
            <span>Thời gian còn lại:</span>
          </div>
          <div className="font-mono text-xs font-bold text-amber-300 tracking-wider">
            {formatCountdown(remainingMs)}
          </div>
        </div>

        {/* Elapsed Progress Bar */}
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-1000"
              style={{ width: `${percentElapsed}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Bắt đầu</span>
            <span>Tự động hoàn nguyên giá gốc khi kết thúc</span>
          </div>
        </div>

        {/* Emergency Revert Action */}
        {!showConfirm ? (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={isReverting}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 hover:text-white transition-all"
            >
              {isReverting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang hoàn nguyên...
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Hoàn nguyên ngay
                </>
              )}
            </button>
          </div>
        ) : (
          /* Confirmation Popover */
          <div className="rounded-lg border border-rose-500/60 bg-rose-950/90 p-3 space-y-2 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-2 text-xs text-rose-200">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                Xác nhận hoàn nguyên sớm? Giá của toàn bộ <strong>{campaign.totalProducts}</strong> sản phẩm sẽ lập tức trở lại mức giá gốc ban đầu.
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmRevert}
                disabled={isReverting}
                className="flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-500 shadow-sm"
              >
                {isReverting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Xác nhận hoàn nguyên
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
