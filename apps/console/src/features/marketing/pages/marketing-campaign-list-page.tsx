// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MarketingApi } from "../api/marketing-api";
import type { CreateMarketingCampaignInput, MarketingCampaign } from "../types";

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
      setError(err.message || "Failed to load marketing campaigns");
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>📢</span> Tiếp thị & Ấn phẩm Facebook
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Điều hành phòng Marketing số (Content, Visual, Publisher), duyệt bài đăng Fanpage và xuất bản Deliverables.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm text-sm flex items-center gap-2 transition"
        >
          <span>✨</span> Giao việc Tiếp thị mới
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-gray-500">
          Đang tải danh sách chiến dịch tiếp thị...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center space-y-4">
          <div className="text-4xl">🚀</div>
          <div>
            <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Chưa có chiến dịch tiếp thị nào được khởi tạo
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Bạn có thể giao việc ngay cho 3 nhân sự số Marketing để tạo nội dung, thiết kế ảnh 1:1 và đăng lên Fanpage.
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition"
          >
            + Giao việc cho Phòng Marketing ngay
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs font-semibold text-gray-500 border-b border-gray-200 dark:border-gray-800 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Mã Chiến Dịch</th>
                <th className="px-6 py-3.5">Trạng Thái</th>
                <th className="px-6 py-3.5">Hình Thức Giao Việc</th>
                <th className="px-6 py-3.5">Người Khởi Tạo</th>
                <th className="px-6 py-3.5">Thời Gian</th>
                <th className="px-6 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {campaigns.map((camp) => (
                <tr key={camp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition">
                  <td className="px-6 py-4 font-mono text-xs text-gray-900 dark:text-gray-100">
                    <Link
                      to={`/marketing/campaigns/${camp.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      {camp.id.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase">
                      {camp.state.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">
                    {camp.assignmentMode}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">
                    {camp.createdBy}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {new Date(camp.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/marketing/campaigns/${camp.id}`}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition inline-flex items-center gap-1"
                    >
                      Vào Phòng Điều Khiển →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-2xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>✨</span> Khởi tạo Chiến dịch Tiếp thị Mới
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Giao việc trực tiếp cho các nhân sự số Marketing (Viết bài, Thiết kế ảnh 1:1, Đăng Facebook).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Tên chiến dịch:
                </label>
                <input
                  type="text"
                  required
                  value={formData.campaignName}
                  onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="VD: Quảng bá NovaPhone 17 Pro Max"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Mục tiêu chiến dịch:
                </label>
                <input
                  type="text"
                  required
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="VD: Thúc đẩy đặt hàng với ưu đãi giảm giá 15%"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Mã sản phẩm (Catalog Reference):
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subjectReference}
                    onChange={(e) => setFormData({ ...formData, subjectReference: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ID Trang Facebook Fanpage:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.facebookPageId}
                    onChange={(e) => setFormData({ ...formData, facebookPageId: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Thông điệp bắt buộc (Mandatory Message):
                </label>
                <input
                  type="text"
                  required
                  value={formData.mandatoryMessage}
                  onChange={(e) => setFormData({ ...formData, mandatoryMessage: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="VD: Ưu đãi giảm ngay 15% cho khách hàng đặt trước hôm nay"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Lời kêu gọi hành động (Call To Action):
                </label>
                <input
                  type="text"
                  required
                  value={formData.callToAction}
                  onChange={(e) => setFormData({ ...formData, callToAction: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="VD: Đặt trước ngay tại NovaCommerce Store"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Đối tượng khách hàng mục tiêu (Audience):
                </label>
                <input
                  type="text"
                  value={formData.audience}
                  onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? "Đang khởi tạo..." : "🚀 Bắt đầu Chiến dịch & Giao việc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
