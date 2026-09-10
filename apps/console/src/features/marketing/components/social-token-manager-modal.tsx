// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Zap,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Clock,
  KeyRound,
} from "lucide-react";
import type { SocialTokensSummaryView, SocialTokenHealthView } from "../api/marketing-api";
import "../styles/marketing.css";

export interface SocialTokenManagerModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly summary: SocialTokensSummaryView | null;
  readonly onRefreshAccount: (platform: "facebook" | "instagram", accountId: string) => Promise<void>;
  readonly onCheckTokens: () => Promise<void>;
  readonly onUpdateToken?: (platform: "facebook" | "instagram", token: string, accountId?: string) => Promise<void>;
  readonly onSyncEnv?: () => Promise<void>;
  readonly onOAuthReconnect?: (platform: "facebook" | "instagram") => void;
  readonly onConfigureMetaApp?: (appId: string, appSecret: string) => Promise<void>;
  readonly isActionLoading?: boolean;
  readonly actionFeedback?: string | null;
}

export function SocialTokenManagerModal({
  isOpen,
  onClose,
  summary,
  onRefreshAccount,
  onCheckTokens,
  onUpdateToken,
  onSyncEnv,
  onOAuthReconnect,
  onConfigureMetaApp,
  isActionLoading = false,
  actionFeedback,
}: SocialTokenManagerModalProps) {
  const [refreshingAccountKey, setRefreshingAccountKey] = useState<string | null>(null);
  const [quickInputOpen, setQuickInputOpen] = useState(false);
  const [metaAppConfigOpen, setMetaAppConfigOpen] = useState(false);
  const [appIdInput, setAppIdInput] = useState("");
  const [appSecretInput, setAppSecretInput] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<"facebook" | "instagram">("facebook");
  const [tokenInput, setTokenInput] = useState("");
  const [editingCardKey, setEditingCardKey] = useState<string | null>(null);
  const [cardTokenInput, setCardTokenInput] = useState("");

  useEffect(() => {
    if (summary?.metaAppId) {
      setAppIdInput(summary.metaAppId);
    } else if (typeof window !== "undefined") {
      const stored = localStorage.getItem("opendx_meta_app_id");
      if (stored) setAppIdInput(stored);
    }
    if (typeof window !== "undefined") {
      const storedSecret = localStorage.getItem("opendx_meta_app_secret");
      if (storedSecret) setAppSecretInput(storedSecret);
    }
  }, [summary?.metaAppId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleRefresh = async (account: SocialTokenHealthView) => {
    const key = `${account.platform}:${account.accountId}`;
    try {
      setRefreshingAccountKey(key);
      await onRefreshAccount(account.platform, account.accountId);
    } finally {
      setRefreshingAccountKey(null);
    }
  };

  const handleApplyQuickToken = async () => {
    if (!onUpdateToken || !tokenInput.trim()) return;
    await onUpdateToken(selectedPlatform, tokenInput.trim());
    setTokenInput("");
    setQuickInputOpen(false);
  };

  const handleApplyCardToken = async (account: SocialTokenHealthView) => {
    if (!onUpdateToken || !cardTokenInput.trim()) return;
    await onUpdateToken(account.platform, cardTokenInput.trim(), account.accountId);
    setCardTokenInput("");
    setEditingCardKey(null);
  };

  const handleSaveMetaAppConfig = async () => {
    if (!appIdInput.trim() || !appSecretInput.trim()) return;
    if (typeof window !== "undefined") {
      localStorage.setItem("opendx_meta_app_id", appIdInput.trim());
      localStorage.setItem("opendx_meta_app_secret", appSecretInput.trim());
    }
    if (onConfigureMetaApp) {
      await onConfigureMetaApp(appIdInput.trim(), appSecretInput.trim());
    }
    setMetaAppConfigOpen(false);
  };

  const getStatusBadge = (account: SocialTokenHealthView) => {
    switch (account.status) {
      case "valid":
        return (
          <span className="socialTokenBadge valid" role="status">
            <ShieldCheck size={13} />
            <span>{account.expiresInHuman || (account.daysRemaining !== null ? `Còn ${account.daysRemaining} ngày` : "Vĩnh viễn (Never expires)")}</span>
          </span>
        );
      case "expiring_soon":
        return (
          <span className="socialTokenBadge warning" role="status">
            <Clock size={13} />
            <span>Sắp hết hạn ({account.expiresInHuman || `${account.hoursRemaining ?? account.daysRemaining ?? 0} giờ`})</span>
          </span>
        );
      case "expired":
        return (
          <span className="socialTokenBadge danger" role="status">
            <ShieldAlert size={13} />
            <span>Đã hết hạn</span>
          </span>
        );
      case "invalid":
        return (
          <span className="socialTokenBadge danger" role="status">
            <ShieldAlert size={13} />
            <span>Không hợp lệ (Lỗi Meta API)</span>
          </span>
        );
      default:
        return (
          <span className="socialTokenBadge neutral" role="status">
            <Shield size={13} />
            <span>Chưa kích hoạt</span>
          </span>
        );
    }
  };

  return createPortal(
    <div className="fbModalBackdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="social-token-modal-title">
      <div className="fbModalContainer socialTokenModalContainer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="socialTokenModalHeader">
          <div className="socialTokenModalTitleGroup">
            <div className="socialTokenModalIconWrap">
              <KeyRound size={20} className="socialTokenKeyIcon" />
            </div>
            <div>
              <h3 id="social-token-modal-title" className="socialTokenModalTitle">
                Giám sát & Tự động Quản lý Social Tokens
              </h3>
              <p className="socialTokenModalSubtitle">
                Theo dõi thời hạn Access Token của Facebook Page & Instagram Business. Tự động cảnh báo trước 2-3 giờ (với token 1 ngày) hoặc 7 ngày (với token dài hạn), quy trình 1-click tự động phục hồi.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="socialTokenModalCloseBtn"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action feedback message */}
        {actionFeedback && (
          <div className="socialTokenFeedbackBanner" role="alert">
            <CheckCircle2 size={16} />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Global Toolbar */}
        <div className="socialTokenToolbar">
          <div className="socialTokenCheckedInfo">
            <Clock size={13} />
            <span>
              Kiểm tra lần cuối: {summary?.checkedAt ? new Date(summary.checkedAt).toLocaleTimeString("vi-VN") : "Chưa có"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {onSyncEnv && (
              <button
                type="button"
                className="socialTokenRefreshAllBtn"
                style={{ background: "#2563eb", color: "#ffffff", borderColor: "#1d4ed8" }}
                onClick={() => void onSyncEnv()}
                disabled={isActionLoading}
                title="Đồng bộ tự động các token cấu hình từ file .env vào cơ sở dữ liệu"
              >
                <Zap size={14} />
                <span>Đồng bộ từ .env</span>
              </button>
            )}
            <button
              type="button"
              className="socialTokenRefreshAllBtn"
              onClick={onCheckTokens}
              disabled={isActionLoading}
            >
              <RefreshCw size={14} className={isActionLoading ? "ccSpinSlow" : ""} />
              <span>{isActionLoading ? "Đang kiểm tra..." : "Kiểm tra sức khỏe ngay"}</span>
            </button>
            <button
              type="button"
              className="socialTokenRefreshAllBtn"
              style={{ background: metaAppConfigOpen ? "#475569" : "#4338ca", color: "#ffffff", borderColor: "#3730a3" }}
              onClick={() => setMetaAppConfigOpen(!metaAppConfigOpen)}
              title="Cấu hình Meta App ID và App Secret để mở tính năng 1-Click Facebook OAuth Login"
            >
              <span>{metaAppConfigOpen ? "Đóng cài đặt App" : "⚙️ Cấu hình Meta App"}</span>
            </button>
            <button
              type="button"
              className="socialTokenRefreshAllBtn"
              style={{ background: quickInputOpen ? "#475569" : "#059669", color: "#ffffff", borderColor: "#047857" }}
              onClick={() => setQuickInputOpen(!quickInputOpen)}
            >
              <span>{quickInputOpen ? "Đóng nhập nhanh" : "⚡ Nhập Token trực tiếp"}</span>
            </button>
          </div>
        </div>

        {/* Meta App Configuration Form */}
        {metaAppConfigOpen && (
          <div className="socialTokenQuickInputCard" style={{ borderColor: "#6366f1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h4 className="socialTokenQuickInputTitle" style={{ color: "#a5b4fc" }}>
                <KeyRound size={15} />
                <span>Cấu hình Meta App (1-Click Facebook OAuth Login)</span>
              </h4>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "9999px",
                  background: summary?.oauthConfigured ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: summary?.oauthConfigured ? "#34d399" : "#fbbf24",
                  fontWeight: 600,
                }}
              >
                {summary?.oauthConfigured ? "✓ Đã sẵn sàng OAuth" : "⚠️ Chưa hoàn tất cấu hình"}
              </span>
            </div>
            <p className="socialTokenQuickInputDesc">
              Để kích hoạt nút <strong>[1-Click Kết nối lại]</strong> tự động lấy Page Token vĩnh viễn không cần dán thủ công:
              <br />
              1. Vào <strong>developers.facebook.com/apps</strong> &rarr; Chọn App của bạn.
              <br />
              2. Facebook Login &rarr; Cài đặt &rarr; Thêm URI chuyển hướng: <code>{typeof window !== "undefined" ? `${window.location.origin}/auth/oauth-callback` : "http://localhost:3000/auth/oauth-callback"}</code>
              <br />
              3. Điền Meta App ID và App Secret (trong Cài đặt &rarr; Cơ bản) rồi ấn <strong>Lưu cấu hình</strong>:
            </p>
            <div className="socialTokenQuickInputRow" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="Meta App ID (ví dụ: 123456789012345)..."
                value={appIdInput}
                onChange={(e) => setAppIdInput(e.target.value)}
                className="socialTokenInput"
                style={{ flex: "1 1 200px" }}
              />
              <input
                type="password"
                placeholder="Meta App Secret..."
                value={appSecretInput}
                onChange={(e) => setAppSecretInput(e.target.value)}
                className="socialTokenInput"
                style={{ flex: "1 1 240px" }}
              />
              <button
                type="button"
                className="socialTokenActionBtn autoRenewBtn"
                onClick={handleSaveMetaAppConfig}
                disabled={isActionLoading || !appIdInput.trim() || !appSecretInput.trim()}
              >
                {isActionLoading ? <Loader2 size={13} className="ccSpinSlow" /> : <CheckCircle2 size={13} />}
                <span>Lưu cấu hình</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Token Apply Form */}
        {quickInputOpen && (
          <div className="socialTokenQuickInputCard">
            <h4 className="socialTokenQuickInputTitle">
              <Zap size={15} />
              <span>Cập nhật Access Token trực tiếp từ Graph API Explorer (Không cần khởi động lại)</span>
            </h4>
            <p className="socialTokenQuickInputDesc">
              Khi phiên đăng nhập bị Facebook hủy (User logged out), hãy copy mã Access Token từ Graph API Explorer, chọn nền tảng và bấm Áp dụng:
            </p>
            <div className="socialTokenQuickInputRow">
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value as any)}
                className="socialTokenSelect"
              >
                <option value="facebook">Facebook Fanpage</option>
                <option value="instagram">Instagram Business</option>
              </select>
              <input
                type="text"
                placeholder="Dán token mới (EAA...)..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="socialTokenInput"
              />
              <button
                type="button"
                className="socialTokenActionBtn autoRenewBtn"
                onClick={handleApplyQuickToken}
                disabled={isActionLoading || !tokenInput.trim()}
              >
                {isActionLoading ? <Loader2 size={13} className="ccSpinSlow" /> : <CheckCircle2 size={13} />}
                <span>Lưu & Kiểm tra ngay</span>
              </button>
            </div>
          </div>
        )}

        {/* Account Cards / List */}
        <div className="socialTokenList">
          {(!summary?.accounts || summary.accounts.length === 0) ? (
            <div className="socialTokenEmptyState">
              <Shield size={32} />
              <p>Chưa có tài khoản mạng xã hội nào được kết nối.</p>
            </div>
          ) : (
            summary.accounts.map((account) => {
              const key = `${account.platform}:${account.accountId}`;
              const isItemRefreshing = refreshingAccountKey === key;
              const isWarningOrExpired = account.status === "expiring_soon" || account.status === "expired" || account.status === "invalid";
              const isEditingThis = editingCardKey === key;

              return (
                <div key={key} className={`socialTokenAccountCard ${isWarningOrExpired ? "hasAlert" : ""}`}>
                  <div className="socialTokenAccountMain">
                    <div className="socialTokenPlatformBadge">
                      <span className="platformIcon">
                        {account.platform === "facebook" ? "📘" : "📸"}
                      </span>
                      <span className="platformLabel">
                        {account.platform === "facebook" ? "Facebook Fanpage" : "Instagram Business"}
                      </span>
                    </div>

                    <div className="socialTokenAccountInfo">
                      <div className="accountNameRow">
                        <span className="accountName">{account.accountName || account.accountId}</span>
                        <span className="accountIdTag">ID: {account.accountId}</span>
                        {getStatusBadge(account)}
                      </div>

                      <div className="accountTokenPreviewRow">
                        <span className="tokenLabel">Token Preview:</span>
                        <code className="tokenPreviewCode">{account.tokenPreview || "••••••••"}</code>
                        {account.expiresAt ? (
                          <span className="tokenExpiryDate">
                            (Hết hạn: {new Date(account.expiresAt).toLocaleDateString("vi-VN")})
                          </span>
                        ) : (
                          <span className="tokenExpiryDate">(Không thời hạn)</span>
                        )}
                      </div>

                      {account.lastError && (
                        <div className="socialTokenErrorNotice" role="alert">
                          <AlertTriangle size={13} />
                          <span>{account.lastError}</span>
                        </div>
                      )}

                      {account.message && !account.lastError && (
                        <p className="socialTokenMessageHint">{account.message}</p>
                      )}

                      {isEditingThis && (
                        <div className="socialTokenCardEditRow">
                          <input
                            type="text"
                            placeholder="Dán token mới vào đây..."
                            value={cardTokenInput}
                            onChange={(e) => setCardTokenInput(e.target.value)}
                            className="socialTokenInput"
                          />
                          <button
                            type="button"
                            className="socialTokenActionBtn autoRenewBtn"
                            onClick={() => handleApplyCardToken(account)}
                            disabled={isActionLoading || !cardTokenInput.trim()}
                          >
                            <span>Lưu</span>
                          </button>
                          <button
                            type="button"
                            className="socialTokenActionBtn cancelBtn"
                            onClick={() => { setEditingCardKey(null); setCardTokenInput(""); }}
                          >
                            <span>Hủy</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="socialTokenAccountActions">
                    <button
                      type="button"
                      className="socialTokenActionBtn autoRenewBtn"
                      onClick={() => handleRefresh(account)}
                      disabled={isItemRefreshing || isActionLoading}
                      title="Tự động gia hạn hoặc phục hồi và lưu token mới vào hệ thống mà không cần dán thủ công"
                    >
                      {isItemRefreshing ? (
                        <>
                          <Loader2 size={13} className="ccSpinSlow" />
                          <span>Đang xử lý...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={13} />
                          <span>
                            {account.status === "expiring_soon"
                              ? "Gia hạn ngay (1-Click)"
                              : account.status === "invalid" || account.status === "expired"
                              ? "⚡ Tự động Phục hồi"
                              : "Làm mới Token"}
                          </span>
                        </>
                      )}
                    </button>

                    {account.actionType === "oauth_reconnect" || account.status === "expired" || account.status === "invalid" ? (
                      <button
                        type="button"
                        className="socialTokenActionBtn reconnectBtn"
                        onClick={() => {
                          const hasAppId = Boolean(summary?.metaAppId || (typeof window !== "undefined" && localStorage.getItem("opendx_meta_app_id")));
                          const hasAppSecret = Boolean(summary?.oauthConfigured || (typeof window !== "undefined" && localStorage.getItem("opendx_meta_app_secret")));
                          if (!hasAppId || !hasAppSecret) {
                            setMetaAppConfigOpen(true);
                            return;
                          }
                          onOAuthReconnect?.(account.platform);
                        }}
                        disabled={isActionLoading}
                        title="Bấm để đăng nhập Facebook OAuth và cấp Page Token vĩnh viễn"
                      >
                        <ExternalLink size={13} />
                        <span>1-Click Kết nối lại</span>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="socialTokenActionBtn"
                      style={{ background: "rgba(255, 255, 255, 0.08)", color: "#cbd5e1", border: "1px solid rgba(255, 255, 255, 0.15)" }}
                      onClick={() => {
                        if (isEditingThis) {
                          setEditingCardKey(null);
                        } else {
                          setEditingCardKey(key);
                          setCardTokenInput("");
                        }
                      }}
                      title="Cập nhật nhanh token mới cho tài khoản này"
                    >
                      <span>{isEditingThis ? "Đóng" : "Cập nhật Token"}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Security & Automation Notice Footer */}
        <div className="socialTokenModalFooter">
          <div className="socialTokenSecurityTip">
            <span className="tipIcon">🛡️</span>
            <div>
              <strong>Bảo mật & Tự động hóa hoàn toàn:</strong>
              <p>
                Access Token được che mờ và chỉ phục vụ xuất bản bài viết tự động. Cơ chế tự động gia hạn (Autonomous Monitor) quét định kỳ mỗi 6 giờ và gia hạn trước 7 ngày để đảm bảo chiến dịch không bao giờ bị đình trệ.
              </p>
            </div>
          </div>
          <button type="button" className="socialTokenCloseFooterBtn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
