// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import type { MarketingApi } from "../api/marketing-api";
import type { CreateMarketingCampaignInput, MarketingCampaign } from "../types";
import "../styles/marketing.css";

export function MarketingCampaignListPage({
  api,
}: {
  readonly api: MarketingApi;
}) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<readonly MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    campaignName: "Quảng bá NovaPhone 17 Pro Max",
    objective: "Thúc đẩy đặt hàng sớm với ưu đãi giảm giá 15%",
    subjectReference: "novaphone-15-pro-max",
    audience: "Người yêu công nghệ, chuyên gia sáng tạo nội dung",
    mandatoryMessage: "Ưu đãi độc quyền giảm ngay 15% cho khách hàng đặt trước hôm nay",
    callToAction: "Đặt trước ngay tại NovaCommerce Store",
    facebookPageId: "1321445584378490",
  });

  const fetchList = async () => {
    try {
      setLoading(true);
      const data = await api.listCampaigns();
      setCampaigns(data.items);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Không thể tải danh sách chiến dịch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [api]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload: CreateMarketingCampaignInput = {
        campaignName: formData.campaignName.trim(),
        objective: formData.objective.trim(),
        subjectKind: "catalog_product",
        subjectReference: formData.subjectReference.trim(),
        audience: formData.audience.trim(),
        language: "vi",
        tone: "Hiện đại, hào hứng, sang trọng và chuyên nghiệp",
        mandatoryMessage: formData.mandatoryMessage.trim(),
        prohibitedClaims: ["sản phẩm tốt nhất vũ trụ", "chữa bách bệnh"],
        callToAction: formData.callToAction.trim(),
        facebookPageConfigurationId: formData.facebookPageId.trim() || "1321445584378490",
        scheduledFor: new Date(Date.now() + 3600000).toISOString(),
        deadline: new Date(Date.now() + 86400000).toISOString(),
        approverId: "opendx_admin",
        maximumCostMicros: 500000,
      };

      const newCampaign = await api.createCampaign(payload, crypto.randomUUID());
      setIsCreateOpen(false);
      navigate(`/marketing/campaigns/${newCampaign.id}`);
    } catch (err: any) {
      alert(err.message || "Lỗi tạo chiến dịch tiếp thị");
    } finally {
      setSubmitting(false);
    }
  };

  const awaitingCount = campaigns.filter((c) => c.state === "awaiting_human_approval").length;
  const publishedCount = campaigns.filter((c) => c.state === "completed" || c.state === "publishing").length;

  return (
    <div className="marketingWorkspace">
      <div className="marketingHeader">
        <div>
          <div className="marketingBreadcrumb">
            <span>NOVACOMMERCE</span>
            <span>/</span>
            <span style={{ color: "#94a3b8" }}>DIGITAL WORKFORCE</span>
          </div>
          <h1 className="marketingTitle">
            <span>📢</span> Marketing & Creative Publication
          </h1>
          <p className="marketingSubtitle">
            Trung tâm điều hành 3 nhân sự số Marketing (Content, Visual Design, Publisher). Soạn bài viết, thiết kế ảnh 1:1, duyệt bài và đăng trực tiếp lên Fanpage Facebook.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="marketingBtnPrimary"
        >
          <span>✨</span> Giao việc Tiếp thị mới
        </button>
      </div>

      {/* Metrics Summary */}
      <div className="marketingStatsGrid">
        <div className="marketingStatCard">
          <div className="marketingStatIcon">📊</div>
          <div>
            <div className="marketingStatVal">{campaigns.length}</div>
            <div className="marketingStatLabel">Tổng chiến dịch</div>
          </div>
        </div>
        <div className="marketingStatCard">
          <div className="marketingStatIcon" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", borderColor: "rgba(245, 158, 11, 0.3)" }}>⏳</div>
          <div>
            <div className="marketingStatVal">{awaitingCount}</div>
            <div className="marketingStatLabel">Đang chờ phê duyệt</div>
          </div>
        </div>
        <div className="marketingStatCard">
          <div className="marketingStatIcon" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", borderColor: "rgba(16, 185, 129, 0.3)" }}>🚀</div>
          <div>
            <div className="marketingStatVal">{publishedCount}</div>
            <div className="marketingStatLabel">Đã đăng lên Facebook</div>
          </div>
        </div>
        <div className="marketingStatCard">
          <div className="marketingStatIcon" style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", borderColor: "rgba(168, 85, 247, 0.3)" }}>📁</div>
          <div>
            <div className="marketingStatVal">{campaigns.length * 5}</div>
            <div className="marketingStatLabel">Tài liệu Deliverables</div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "1rem 1.25rem", borderRadius: "0.75rem", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "4rem", textAlign: "center", color: "#64748b", fontSize: "0.9rem" }}>
          🔄 Đang tải dữ liệu chiến dịch tiếp thị...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="marketingCard" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🚀</div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>
            Chưa có chiến dịch tiếp thị nào
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", maxWidth: "500px", margin: "0 auto 1.5rem" }}>
            Khởi tạo chiến dịch đầu tiên để 3 nhân sự số tự động soạn bài viết, tạo ảnh vuông 1:1 và hỗ trợ xuất bản lên Fanpage.
          </p>
          <button onClick={() => setIsCreateOpen(true)} className="marketingBtnPrimary">
            + Giao việc cho Phòng Marketing ngay
          </button>
        </div>
      ) : (
        <div className="marketingCard">
          <table className="marketingTable">
            <thead>
              <tr>
                <th>Mã Chiến Dịch</th>
                <th>Trạng Thái</th>
                <th>Phòng Ban</th>
                <th>Người Khởi Tạo</th>
                <th>Thời Gian</th>
                <th style={{ textAlign: "right" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((camp) => {
                const isAwaiting = camp.state === "awaiting_human_approval";
                const isLive = camp.state === "completed" || camp.state === "publishing";
                const badgeClass = isAwaiting ? "statusBadge awaitingApproval" : isLive ? "statusBadge publishedLive" : "statusBadge drafting";
                return (
                  <tr key={camp.id}>
                    <td>
                      <Link
                        to={`/marketing/campaigns/${camp.id}`}
                        style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "none", fontFamily: "monospace" }}
                      >
                        #{camp.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      <span className={badgeClass}>
                        {isAwaiting ? "awaiting human approval" : isLive ? "published live" : camp.state.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                      Direct Marketing Dept
                    </td>
                    <td style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                      {camp.createdBy}
                    </td>
                    <td style={{ color: "#64748b", fontSize: "0.825rem" }}>
                      {new Date(camp.createdAt).toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        to={`/marketing/campaigns/${camp.id}`}
                        className="marketingBtnSecondary"
                        style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem" }}
                      >
                        View Control Room →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && typeof document !== "undefined" && createPortal(
        <div className="fbModalBackdrop" onClick={() => setIsCreateOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(12px)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", boxSizing: "border-box" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#131722", border: "1px solid rgba(255, 255, 255, 0.16)", borderRadius: "1.25rem", maxWidth: "600px", width: "100%", padding: "1.75rem", boxShadow: "0 25px 80px rgba(0,0,0,0.9)", maxHeight: "90vh", overflowY: "auto", color: "#fff", zIndex: 100000 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>✨</span> Khởi tạo Chiến dịch Tiếp thị Mới
                </h3>
                <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0.25rem 0 0" }}>
                  Giao việc cho Marketing Digital Employees (Content, Visual Design, Publisher).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "1.3rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.875rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                  Tên chiến dịch:
                </label>
                <input
                  type="text"
                  required
                  value={formData.campaignName}
                  onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                  style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", outline: "none" }}
                  placeholder="VD: Quảng bá NovaPhone 17 Pro Max"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                  Mục tiêu chiến dịch:
                </label>
                <input
                  type="text"
                  required
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                  style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", outline: "none" }}
                  placeholder="VD: Thúc đẩy đặt hàng sớm với ưu đãi giảm giá 15%"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                    Mã sản phẩm:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subjectReference}
                    onChange={(e) => setFormData({ ...formData, subjectReference: e.target.value })}
                    style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                    ID Fanpage Facebook:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.facebookPageId}
                    onChange={(e) => setFormData({ ...formData, facebookPageId: e.target.value })}
                    style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", outline: "none" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                  Thông điệp bắt buộc (Mandatory Message):
                </label>
                <input
                  type="text"
                  required
                  value={formData.mandatoryMessage}
                  onChange={(e) => setFormData({ ...formData, mandatoryMessage: e.target.value })}
                  style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", outline: "none" }}
                  placeholder="VD: Ưu đãi giảm ngay 15% cho khách hàng đặt trước hôm nay"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                  Lời kêu gọi hành động (Call To Action):
                </label>
                <input
                  type="text"
                  required
                  value={formData.callToAction}
                  onChange={(e) => setFormData({ ...formData, callToAction: e.target.value })}
                  style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", outline: "none" }}
                  placeholder="VD: Đặt trước ngay tại NovaCommerce Store"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "0.35rem" }}>
                  Đối tượng khách hàng mục tiêu:
                </label>
                <input
                  type="text"
                  value={formData.audience}
                  onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                  style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: "0.65rem", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.4)", color: "#fff", outline: "none" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="marketingBtnSecondary"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="marketingBtnPrimary"
                >
                  {submitting ? "Đang khởi tạo..." : "🚀 Bắt đầu Chiến dịch & Giao việc"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
