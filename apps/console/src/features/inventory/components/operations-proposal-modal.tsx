// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type {
  OperationsProposal,
  OperationsProposalItem,
  StockRiskClassification,
} from "../types/inventory.types";

export interface OperationsProposalModalProps {
  readonly isOpen: boolean;
  readonly proposal: OperationsProposal;
  readonly onClose: () => void;
  readonly onApply: (
    items: readonly { variantId: string; restockQuantity: number }[],
  ) => Promise<void> | void;
  readonly onDownloadDocx: () => Promise<void> | void;
  readonly onTriggerClearanceCampaign?: (
    slowMovingItems: readonly OperationsProposalItem[],
  ) => void;
  readonly isApplying?: boolean;
  readonly isDownloadingDocx?: boolean;
}

type FilterTab = "all" | "critical_low" | "slow_moving" | "balanced";

export function OperationsProposalModal({
  isOpen,
  proposal,
  onClose,
  onApply,
  onDownloadDocx,
  onTriggerClearanceCampaign,
  isApplying = false,
  isDownloadingDocx = false,
}: OperationsProposalModalProps) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const item of proposal.items) {
      initial[item.variantId] = item.recommendedRestockQuantity;
    }
    return initial;
  });

  const [appliedSuccess, setAppliedSuccess] = useState(
    proposal.status === "applied",
  );
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const slowMovingItems = useMemo(
    () => proposal.items.filter((it) => it.stockStatus === "slow_moving"),
    [proposal.items],
  );

  const clearanceCandidates = useMemo(
    () =>
      slowMovingItems.length > 0
        ? slowMovingItems
        : proposal.items.filter((it) => it.availableQuantity > 0),
    [slowMovingItems, proposal.items],
  );

  const criticalItems = useMemo(
    () => proposal.items.filter((it) => it.stockStatus === "critical_low"),
    [proposal.items],
  );

  const balancedItems = useMemo(
    () => proposal.items.filter((it) => it.stockStatus === "balanced"),
    [proposal.items],
  );

  const filteredItems = useMemo(() => {
    if (filter === "all") return proposal.items;
    return proposal.items.filter((it) => it.stockStatus === filter);
  }, [filter, proposal.items]);

  const { totalUnits, totalBudget } = useMemo(() => {
    let units = 0;
    let budget = 0;
    for (const item of proposal.items) {
      const qty = quantities[item.variantId] ?? 0;
      units += qty;
      budget += qty * item.estimatedUnitCostVnd;
    }
    return { totalUnits: units, totalBudget: budget };
  }, [proposal.items, quantities]);

  if (!isOpen) return null;

  const handleQuantityChange = (variantId: string, val: number) => {
    const cleanVal = Math.max(0, Math.floor(isNaN(val) ? 0 : val));
    setQuantities((prev) => ({ ...prev, [variantId]: cleanVal }));
  };

  const handleSetSafeRestock = () => {
    setQuantities((prev) => {
      const next = { ...prev };
      for (const it of proposal.items) {
        if (it.stockStatus === "critical_low") {
          next[it.variantId] =
            it.recommendedRestockQuantity > 0
              ? it.recommendedRestockQuantity
              : Math.max(10, it.safetyStockThreshold * 2 - it.availableQuantity);
        } else {
          next[it.variantId] = 0;
        }
      }
      return next;
    });
  };

  const handleResetToZero = () => {
    setQuantities((prev) => {
      const next = { ...prev };
      for (const it of proposal.items) {
        next[it.variantId] = 0;
      }
      return next;
    });
  };

  const handleApprove = async () => {
    if (isApplying) return;
    const payload = proposal.items.map((it) => ({
      variantId: it.variantId,
      restockQuantity: quantities[it.variantId] ?? 0,
    }));
    await onApply(payload);
    setAppliedSuccess(true);
  };

  return (
    <div className="ccModalOverlay" role="dialog" aria-modal="true" aria-labelledby="operations-modal-title">
      <div className="ccOperationsModalContainer">
        {/* Modal Header */}
        <div className="ccOperationsModalHeader">
          <div className="ccOperationsModalHeaderTitle">
            <div className="ccOperationsIconBadge">
              <Boxes size={22} color="#fbbf24" />
            </div>
            <div>
              <h2 id="operations-modal-title" className="ccOperationsModalHeading">
                Đề xuất Kiểm toán Tồn kho & Nhập hàng
              </h2>
              <p className="ccOperationsModalSubheading">
                Phân tích bởi <strong>Kỹ sư Tồn kho</strong> & <strong>Điều phối Đơn hàng</strong> (NovaCommerce)
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ccOperationsModalCloseBtn"
            onClick={onClose}
            title="Đóng cửa sổ"
          >
            <X size={18} />
          </button>
        </div>

        {/* Health Summary & Risk Callouts */}
        <div className="ccOperationsSummaryGrid">
          <div className="ccOperationsSummaryBox info">
            <div className="ccOperationsSummaryHeader info">
              <Info size={16} />
              <span>Sức khỏe kho hàng</span>
            </div>
            <p className="ccOperationsSummaryText">
              {proposal.inventoryHealthSummary}
            </p>
          </div>
          <div className="ccOperationsSummaryBox danger">
            <div className="ccOperationsSummaryHeader danger">
              <AlertTriangle size={16} />
              <span>Phân tích rủi ro chuỗi cung ứng</span>
            </div>
            <p className="ccOperationsSummaryText">
              {proposal.riskAssessment}
            </p>
          </div>
        </div>

        {/* Filter Tabs and Quick Actions */}
        <div className="ccOperationsToolbar">
          <div className="ccOperationsFilterTabs">
            <button
              type="button"
              className={`ccOperationsFilterTab ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              Tất cả ({proposal.items.length})
            </button>
            <button
              type="button"
              className={`ccOperationsFilterTab critical ${filter === "critical_low" ? "active" : ""}`}
              onClick={() => setFilter("critical_low")}
            >
              🔴 Cạn kiệt ({criticalItems.length})
            </button>
            <button
              type="button"
              className={`ccOperationsFilterTab slow ${filter === "slow_moving" ? "active" : ""}`}
              onClick={() => setFilter("slow_moving")}
            >
              🟡 Tồn đọng ({slowMovingItems.length})
            </button>
            <button
              type="button"
              className={`ccOperationsFilterTab balanced ${filter === "balanced" ? "active" : ""}`}
              onClick={() => setFilter("balanced")}
            >
              🟢 An toàn ({balancedItems.length})
            </button>
          </div>

          <div className="ccOperationsQuickActions">
            <button
              type="button"
              className="ccOperationsQuickBtn"
              onClick={handleSetSafeRestock}
              title="Điền tự động số lượng nhập an toàn cho SKU cạn kiệt"
            >
              <Sparkles size={13} />
              <span>⚡ Nhập theo mức an toàn</span>
            </button>
            <button
              type="button"
              className="ccOperationsQuickBtn"
              onClick={handleResetToZero}
              title="Đặt tất cả số lượng nhập về 0"
            >
              <RotateCcw size={13} />
              <span>🔄 Đặt tất cả về 0</span>
            </button>
          </div>
        </div>

        {/* Table of Items */}
        <div className="ccOperationsTableWrap">
          <table className="ccOperationsTable">
            <thead>
              <tr>
                <th style={{ width: "140px" }}>Mã SKU</th>
                <th>Sản phẩm</th>
                <th style={{ textAlign: "center", width: "90px" }}>Tồn thực</th>
                <th style={{ textAlign: "center", width: "90px" }}>Khả dụng</th>
                <th style={{ textAlign: "center", width: "110px" }}>Trạng thái</th>
                <th style={{ textAlign: "center", width: "160px" }}>Số lượng nhập</th>
                <th style={{ textAlign: "right", width: "120px" }}>Giá vốn ước tính</th>
                <th style={{ textAlign: "right", width: "140px" }}>Dự toán chi phí</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const qty = quantities[item.variantId] ?? 0;
                const lineTotal = qty * item.estimatedUnitCostVnd;

                return (
                  <tr key={item.variantId}>
                    <td className="ccOperationsSkuCell">{item.sku}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                        <div className="ccOperationsProductName">{item.productName}</div>
                        {item.recentUnitsSold7d !== undefined && (
                          <span
                            className="ccOperationsVelocityBadge"
                            title="Số lượng đã bán trong 7 ngày qua"
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#fbbf24",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            🔥 Đã bán 7 ngày: {item.recentUnitsSold7d}
                          </span>
                        )}
                      </div>
                      <div className="ccOperationsActionRationale">{item.actionRationale}</div>
                    </td>
                    <td style={{ textAlign: "center" }} className="ccOperationsCountCell">
                      <strong>{item.currentOnHand}</strong>
                      {appliedSuccess && qty > 0 && (
                        <div style={{ fontSize: "0.72rem", color: "#10b981", fontWeight: 600 }}>
                          +{qty} đã nhập
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`ccOperationsStockBadge ${item.stockStatus}`}>
                        {item.availableQuantity}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`ccOperationsStatusPill ${item.stockStatus}`}>
                        {item.stockStatus === "critical_low"
                          ? "Cạn kiệt"
                          : item.stockStatus === "slow_moving"
                            ? "Tồn đọng"
                            : "An toàn"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="ccOperationsQtyControl">
                        <button
                          type="button"
                          className="ccOperationsQtyBtn"
                          disabled={qty <= 0 || appliedSuccess}
                          onClick={() => handleQuantityChange(item.variantId, qty - 5)}
                          title="Giảm 5 đơn vị"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          data-testid={`qty-input-${item.variantId}`}
                          className="ccOperationsQtyInput"
                          min={0}
                          value={qty === 0 ? "" : qty}
                          placeholder="0"
                          disabled={appliedSuccess}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              handleQuantityChange(item.variantId, 0);
                            } else {
                              const parsed = parseInt(raw, 10);
                              handleQuantityChange(item.variantId, isNaN(parsed) ? 0 : parsed);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="ccOperationsQtyBtn"
                          disabled={appliedSuccess}
                          onClick={() => handleQuantityChange(item.variantId, qty + 5)}
                          title="Tăng 5 đơn vị"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }} className="ccOperationsCostCell">
                      {item.estimatedUnitCostVnd.toLocaleString("vi-VN")} đ
                    </td>
                    <td style={{ textAlign: "right" }} className="ccOperationsTotalCostCell">
                      {lineTotal > 0 ? `${lineTotal.toLocaleString("vi-VN")} đ` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="ccOperationsFooterTotalLabel">
                  Tổng cộng ({proposal.items.length} mặt hàng)
                </td>
                <td style={{ textAlign: "center" }} className="ccOperationsFooterQty">
                  +<span data-testid="total-restock-units">{totalUnits}</span> đơn vị
                </td>
                <td colSpan={2} style={{ textAlign: "right" }} className="ccOperationsFooterBudget">
                  {totalBudget.toLocaleString("vi-VN")} đ
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Post-Approval Banner */}
        {appliedSuccess && (
          <div className="ccOperationsSuccessBanner">
            <CheckCircle2 size={20} color="#10b981" />
            <span>
              Đã phê duyệt và cập nhật thành công <strong>+{totalUnits} đơn vị hàng</strong> vào PostgreSQL!
            </span>
          </div>
        )}

        {/* Download & Action Notice */}
        {downloadNotice && (
          <div
            style={{
              padding: "0.6rem 1.75rem",
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: downloadNotice.startsWith("Lỗi")
                ? "rgba(239, 68, 68, 0.12)"
                : "rgba(16, 185, 129, 0.12)",
              color: downloadNotice.startsWith("Lỗi") ? "#ef4444" : "#10b981",
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            {downloadNotice.startsWith("Lỗi") ? (
              <AlertTriangle size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            <span>{downloadNotice}</span>
          </div>
        )}

        {/* Modal Actions Footer */}
        <div className="ccOperationsModalFooter">
          <div className="ccOperationsFooterLeft">
            <button
              type="button"
              className="ccOperationsSecondaryBtn"
              disabled={isDownloadingDocx}
              onClick={async () => {
                try {
                  setDownloadNotice(null);
                  await onDownloadDocx();
                  setDownloadNotice("Đã tải xuống file Word (.docx) thành công!");
                } catch (err) {
                  setDownloadNotice(
                    "Lỗi khi tải file Word: " +
                      (err instanceof Error ? err.message : String(err)),
                  );
                }
              }}
            >
              <FileText size={15} />
              <span>{isDownloadingDocx ? "Đang tạo file..." : "📥 Tải Báo Cáo Word (.docx)"}</span>
            </button>

            {clearanceCandidates.length > 0 && onTriggerClearanceCampaign && !appliedSuccess && (
              <button
                type="button"
                className="ccOperationsClearanceBtn"
                onClick={() => onTriggerClearanceCampaign(clearanceCandidates)}
                title="Chuyển sang phòng Danh mục để xây dựng chương trình Flash Sale xả kho"
              >
                <Sparkles size={15} color="#f59e0b" />
                <span>⚡ Đề xuất Chiến dịch Xả hàng Tồn kho ({clearanceCandidates.length} SKU)</span>
              </button>
            )}
          </div>

          <div className="ccOperationsFooterRight">
            <button
              type="button"
              className="ccOperationsCancelBtn"
              onClick={onClose}
            >
              {appliedSuccess ? "Đóng" : "Hủy"}
            </button>

            {!appliedSuccess && (
              <button
                type="button"
                className="ccOperationsApproveBtn"
                disabled={isApplying || totalUnits === 0}
                onClick={handleApprove}
              >
                {isApplying ? <Loader2 size={16} className="ccSpin" /> : <CheckCircle2 size={16} />}
                <span>
                  {isApplying
                    ? "Đang ghi nhận vào kho..."
                    : `Phê duyệt & Nhập kho +${totalUnits} đơn vị`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
