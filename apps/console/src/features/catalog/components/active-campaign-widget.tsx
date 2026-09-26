// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Clock,
  FileText,
  Flame,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { ActiveCampaign } from "../api/catalog-api";

export interface ActiveCampaignWidgetProps {
  readonly campaign: ActiveCampaign;
  readonly onRevert: (campaignId: string) => Promise<void> | void;
  readonly isReverting?: boolean;
  readonly onViewDeliverable?: () => void;
}

export function ActiveCampaignWidget({
  campaign,
  onRevert,
  isReverting = false,
  onViewDeliverable,
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
    <div className="ccActiveCampaignBanner ccActiveCampaignHorizontal">
      <div className="ccActiveCampaignMainRow">
        {/* Left Section: Campaign Identity */}
        <div className="ccActiveCampaignIdentityCol">
          <div className="ccActiveCampaignBadgeRow">
            <div className="ccActiveCampaignIconBox">
              <Flame size={18} color="#f43f5e" />
            </div>
            <span className="ccActiveCampaignStatusText">
              Chiến dịch đang kích hoạt
            </span>
            <span className="ccCampaignBadgePill">
              {campaign.badgeText}
            </span>
            <span className="ccCampaignDiscountPill">
              -{campaign.discountPercent}%
            </span>
          </div>

          <h3 className="ccActiveCampaignTitle">
            {campaign.name}
          </h3>

          <div className="ccActiveCampaignSubRow">
            <span className="ccActiveCampaignProductCount">
              {campaign.totalProducts} sản phẩm đang áp dụng giá Flash Sale trên Storefront
            </span>
          </div>
        </div>

        {/* Center Section: Countdown Timer & Progress */}
        <div className="ccActiveCampaignCenterCol">
          <div className="ccActiveCampaignCountdownBox">
            <div className="ccActiveCampaignCountdownLeft">
              <Clock size={16} className="ccActiveCampaignCountdownIcon" />
              <span>Thời gian còn lại:</span>
            </div>
            <div className="ccActiveCampaignCountdownDigits">
              {formatCountdown(remainingMs)}
            </div>
          </div>

          <div className="ccActiveCampaignProgressWrap">
            <div className="ccActiveCampaignProgressBar">
              <div
                className="ccActiveCampaignProgressFill"
                style={{ width: `${percentElapsed}%` }}
              />
            </div>
            <div className="ccActiveCampaignProgressLabels">
              <span>Bắt đầu</span>
              <span>Tự động hoàn nguyên giá gốc khi kết thúc</span>
            </div>
          </div>
        </div>

        {/* Right Section: Actions */}
        <div className="ccActiveCampaignActionsCol">
          {!showConfirm ? (
            <div className="ccActiveCampaignBtnGroup">
              {onViewDeliverable && (
                <button
                  type="button"
                  onClick={onViewDeliverable}
                  className="ccActiveCampaignViewReportBtn"
                  title="Xem báo cáo chiến lược bàn giao"
                >
                  <FileText size={14} />
                  <span>Xem báo cáo</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={isReverting}
                className="ccActiveCampaignRevertBtn"
              >
                {isReverting ? (
                  <>
                    <Loader2 size={14} className="ccSpin" />
                    Đang hoàn nguyên...
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} />
                    Hoàn nguyên ngay
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="ccActiveCampaignConfirmBox">
              <div className="ccActiveCampaignConfirmText">
                <AlertTriangle size={18} className="ccActiveCampaignConfirmIcon" />
                <span>
                  Xác nhận hoàn nguyên sớm? Giá của <strong>{campaign.totalProducts}</strong> sản phẩm sẽ lập tức trở lại giá gốc.
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.6rem" }}>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="ccCampaignCancelBtn"
                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRevert}
                  disabled={isReverting}
                  className="ccCampaignApproveBtn"
                  style={{
                    background: "linear-gradient(135deg, #e11d48, #be123c)",
                    padding: "0.35rem 0.85rem",
                    fontSize: "0.78rem",
                  }}
                >
                  {isReverting ? (
                    <Loader2 size={14} className="ccSpin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  Xác nhận hoàn nguyên
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
