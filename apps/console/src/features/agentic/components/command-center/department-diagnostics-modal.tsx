// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import type { DepartmentType } from "../../types/department-task-queue.types";

export interface DepartmentDiagnosticsModalProps {
  readonly isOpen: boolean;
  readonly department: DepartmentType;
  readonly departmentName: string;
  readonly errorMessage: string;
  readonly timestamp?: number | string;
  readonly onClose: () => void;
  readonly onRetry?: () => void;
  readonly onOpenAuditLogs?: () => void;
  readonly onSpecialAction?: () => void;
  readonly specialActionLabel?: string;
}

export const DepartmentDiagnosticsModal: React.FC<DepartmentDiagnosticsModalProps> = ({
  isOpen,
  department,
  departmentName,
  errorMessage,
  timestamp,
  onClose,
  onRetry,
  onOpenAuditLogs,
  onSpecialAction,
  specialActionLabel,
}) => {
  if (!isOpen) return null;

  const formattedTime = React.useMemo(() => {
    if (!timestamp) return new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const d = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
    return isNaN(d.getTime()) ? new Date().toLocaleTimeString("vi-VN") : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [timestamp]);

  // Root Cause Diagnosis Analysis based on error content
  const rootCauseAnalysis = React.useMemo(() => {
    const lower = errorMessage.toLowerCase();
    if (lower.includes("token") || lower.includes("facebook") || lower.includes("meta")) {
      return {
        category: "Xác thực & Kết nối Mạng xã hội",
        analysis: "Mã truy cập Meta Graph API (Access Token) của Fanpage đã hết hạn hoặc bị thu hồi quyền truy cập. Hệ thống đã tự động kích hoạt chốt chặn Fail-Closed để ngăn chặn việc rò rỉ hoặc đăng tải bài viết sai quy trình.",
        recommendations: [
          "Mở Trung tâm Quản lý Social Tokens để làm mới hoặc cấp lại Access Token.",
          "Kiểm tra quyền hạn publish_pages và pages_manage_posts trên Meta for Developers.",
          "Sau khi cấp lại token, bấm Thử lại để nhân sự AI hoàn tất bài đăng.",
        ],
      };
    }
    if (lower.includes("kho") || lower.includes("sku") || lower.includes("tồn") || lower.includes("stock")) {
      return {
        category: "Kiểm toán & Cân bằng Kho vận",
        analysis: "Dữ liệu tồn kho an toàn hoặc số lượng khả dụng của SKU không đạt ngưỡng tối thiểu quy định. Quy trình xuất/nhập kho bị tạm dừng để tránh tình trạng bán vượt tồn kho (oversell) hoặc lệch kho.",
        recommendations: [
          "Kiểm tra mức tồn kho an toàn trong Bảng quản lý kho vận.",
          "Xem xét duyệt Phiếu Đề Xuất Nhập Kho tự động từ AI Điều phối.",
          "Bấm Thử lại sau khi xác nhận số lượng tồn thực tế.",
        ],
      };
    }
    if (lower.includes("giá") || lower.includes("pricing") || lower.includes("margin") || lower.includes("lợi nhuận")) {
      return {
        category: "Quy tắc Bảo toàn Biên Lợi nhuận",
        analysis: "Mức giá đề xuất hoặc chiến dịch giảm giá vi phạm quy tắc cận dưới của biên lợi nhuận ròng. Nhân sự AI Định giá đã từ chối áp dụng tự động để bảo toàn ngân sách doanh nghiệp.",
        recommendations: [
          "Rà soát bảng chiết khấu và giá gốc trong Danh mục sản phẩm.",
          "Điều chỉnh tỷ lệ giảm giá phù hợp với chính sách phòng ban.",
        ],
      };
    }
    return {
      category: "Vận hành & Phối hợp Nhân sự AI",
      analysis: "Nhân sự AI phụ trách gặp sự cố bất thường khi xử lý luồng dữ liệu hoặc vượt quá thời gian chờ phản hồi (timeout). Hệ thống bảo toàn trạng thái dữ liệu và chuyển tác vụ về cơ chế kiểm soát thủ công.",
      recommendations: [
        "Kiểm tra kết nối mạng và tài nguyên máy chủ CompanyOS.",
        "Xem chi tiết tại Nhật ký Kiểm toán (Audit Logs) để xem toàn bộ ngăn xếp sự kiện.",
        "Bấm Thử lại tác vụ để AI thực thi lại từ bước an toàn gần nhất.",
      ],
    };
  }, [errorMessage]);

  return (
    <div
      className="ccModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnostics-modal-title"
      onClick={onClose}
    >
      <div
        className="ccDiagnosticsModal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ccDiagnosticsHeader">
          <div className="ccDiagnosticsTitleWrap">
            <div className="ccDiagnosticsIconBox">
              <ShieldAlert size={20} color="#f87171" />
            </div>
            <div>
              <h2 id="diagnostics-modal-title" className="ccDiagnosticsTitle">
                Báo cáo Chẩn đoán Lỗi Vận hành
              </h2>
              <p className="ccDiagnosticsSubtitle">
                {`Phòng ban: ${departmentName} • Ghi nhận lúc: ${formattedTime}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ccModalCloseBtn"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="ccDiagnosticsBody">
          {/* Main Error Banner */}
          <div className="ccDiagnosticsAlertBanner" role="alert">
            <div className="ccDiagnosticsAlertIcon">
              <AlertOctagon size={18} color="#ef4444" />
            </div>
            <div className="ccDiagnosticsAlertContent">
              <div className="ccDiagnosticsAlertBadge">
                <span>Cần can thiệp vận hành (Fail-Closed Active)</span>
              </div>
              <p className="ccDiagnosticsErrorMsg">{errorMessage}</p>
            </div>
          </div>

          {/* Root Cause Analysis */}
          <div className="ccDiagnosticsSection">
            <h3 className="ccDiagnosticsSectionTitle">
              <AlertTriangle size={14} color="#fbbf24" />
              <span>Phân tích nguyên nhân ({rootCauseAnalysis.category})</span>
            </h3>
            <p className="ccDiagnosticsSectionText">
              {rootCauseAnalysis.analysis}
            </p>
          </div>

          {/* Action Recommendations */}
          <div className="ccDiagnosticsSection">
            <h3 className="ccDiagnosticsSectionTitle">
              <CheckCircle2 size={14} color="#34d399" />
              <span>Khuyến nghị xử lý & Khắc phục</span>
            </h3>
            <ul className="ccDiagnosticsList">
              {rootCauseAnalysis.recommendations.map((rec, idx) => (
                <li key={idx} className="ccDiagnosticsListItem">
                  <span className="ccDiagnosticsListNum">{idx + 1}</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* System Governance Notice */}
          <div className="ccDiagnosticsGovNotice">
            <span className="ccDiagnosticsGovDot" />
            <span>
              Cơ chế Governed AI của CompanyOS yêu cầu xác thực con người (Human-in-the-loop) đối với các ngoại lệ vận hành để đảm bảo dữ liệu công ty không bị sai lệch.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="ccDiagnosticsFooter">
          <div className="ccDiagnosticsFooterLeft">
            {onOpenAuditLogs && (
              <button
                type="button"
                className="ccSecondaryOutlineBtn"
                onClick={() => {
                  onClose();
                  onOpenAuditLogs();
                }}
              >
                <FileSearch size={14} />
                <span>Xem Nhật ký Kiểm toán</span>
              </button>
            )}
            {onSpecialAction && specialActionLabel && (
              <button
                type="button"
                className="ccSpecialActionBtn"
                onClick={() => {
                  onClose();
                  onSpecialAction();
                }}
              >
                <span>{specialActionLabel}</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          <div className="ccDiagnosticsFooterRight">
            <button
              type="button"
              className="ccCancelBtn"
              onClick={onClose}
            >
              Đóng
            </button>
            {onRetry && (
              <button
                type="button"
                className="ccPrimaryRetryBtn"
                onClick={() => {
                  onRetry();
                  onClose();
                }}
              >
                <RefreshCw size={14} />
                <span>Thử lại tác vụ</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
