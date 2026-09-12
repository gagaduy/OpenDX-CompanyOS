// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  LineChart,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type {
  StrategicDeliverable,
} from "../../types/strategic-deliverable.types";
import { generateWordDocumentContent } from "../../types/strategic-deliverable.types";

export interface StrategicDeliverableModalProps {
  readonly isOpen: boolean;
  readonly deliverable: StrategicDeliverable | null;
  readonly onClose: () => void;
  readonly onDownloadDocx?: () => void;
  readonly onNavigateToTask?: (taskId: string) => void;
}

type TabKey = "summary" | "insights" | "actionPlan" | "risks";

export const StrategicDeliverableModal: React.FC<StrategicDeliverableModalProps> = ({
  isOpen,
  deliverable,
  onClose,
  onDownloadDocx,
  onNavigateToTask,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen || !deliverable) return null;

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(
        `${deliverable.title}\n\n${deliverable.summary}\n\nNgân sách dự toán: ${
          deliverable.estimatedBudgetVnd
            ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(deliverable.estimatedBudgetVnd)
            : "N/A"
        }`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (onDownloadDocx) {
      onDownloadDocx();
      return;
    }
    setIsDownloading(true);
    try {
      const htmlContent = generateWordDocumentContent(deliverable);
      const blob = new Blob([htmlContent], {
        type: "application/msword;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = deliverable.docxFilename || `Bao_cao_Chien_luoc_${deliverable.id.slice(0, 8)}.docx`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to download docx:", err);
    } finally {
      setTimeout(() => setIsDownloading(false), 600);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return "Theo quyết định CEO";
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
  };

  const formatTimestamp = (ts?: string | number) => {
    if (!ts) return new Date().toLocaleString("vi-VN");
    const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
    return isNaN(d.getTime()) ? new Date().toLocaleString("vi-VN") : d.toLocaleString("vi-VN");
  };

  return (
    <div
      className="sdModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sdModalTitle"
    >
      <div className="sdModalContainer">
        {/* Header */}
        <div className="sdModalHeader">
          <div className="sdHeaderLeft">
            <div className="sdHeaderIconWrap">
              <Sparkles size={22} className="sdHeaderIcon" />
            </div>
            <div>
              <div className="sdHeaderEyebrow">
                <span className="sdDeptBadge">
                  <Award size={12} />
                  {deliverable.departmentName}
                </span>
                <span className="sdCompletedBadge">
                  <CheckCircle2 size={12} />
                  Hoàn tất 100%
                </span>
              </div>
              <h2 id="sdModalTitle" className="sdHeaderTitle">
                {deliverable.title}
              </h2>
              <p className="sdHeaderGoal">
                Chỉ đạo thực thi: &ldquo;{deliverable.goal}&rdquo;
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sdCloseBtn"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* KPI Ribbon Strip */}
        <div className="sdKpiRibbon">
          <div className="sdKpiCard">
            <span className="sdKpiLabel">Thời điểm hoàn tất</span>
            <span className="sdKpiVal">{formatTimestamp(deliverable.completedAt)}</span>
          </div>
          <div className="sdKpiCard">
            <span className="sdKpiLabel">Ngân sách dự toán</span>
            <span className="sdKpiVal green">{formatCurrency(deliverable.estimatedBudgetVnd)}</span>
          </div>
          <div className="sdKpiCard">
            <span className="sdKpiLabel">Tiêu thụ tài nguyên AI</span>
            <span className="sdKpiVal amber">{deliverable.tokenCost.toLocaleString()} tokens</span>
          </div>
          <div className="sdKpiCard">
            <span className="sdKpiLabel">Định dạng tài liệu</span>
            <span className="sdKpiVal indigo">Microsoft Word (.docx)</span>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="sdTabsBar">
          <button
            type="button"
            className={`sdTabBtn ${activeTab === "summary" ? "active" : ""}`}
            onClick={() => setActiveTab("summary")}
          >
            <FileText size={14} />
            <span>Tóm tắt Điều hành</span>
          </button>
          <button
            type="button"
            className={`sdTabBtn ${activeTab === "insights" ? "active" : ""}`}
            onClick={() => setActiveTab("insights")}
          >
            <TrendingUp size={14} />
            <span>Dữ liệu & Thị trường ({deliverable.marketInsights.length})</span>
          </button>
          <button
            type="button"
            className={`sdTabBtn ${activeTab === "actionPlan" ? "active" : ""}`}
            onClick={() => setActiveTab("actionPlan")}
          >
            <LineChart size={14} />
            <span>Lộ trình Thực thi ({deliverable.actionPlan.length} chặng)</span>
          </button>
          <button
            type="button"
            className={`sdTabBtn ${activeTab === "risks" ? "active" : ""}`}
            onClick={() => setActiveTab("risks")}
          >
            <ShieldAlert size={14} />
            <span>Rủi ro & Pháp lý ({deliverable.risks.length})</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="sdModalBody">
          {activeTab === "summary" && (
            <div className="sdTabSection">
              <div className="sdSummaryBox">
                <div className="sdSummaryBoxHeader">
                  <Sparkles size={16} />
                  <h4>Tóm tắt Chiến lược Điều hành (Executive Summary)</h4>
                </div>
                <p className="sdSummaryText">{deliverable.summary}</p>
              </div>

              <div className="sdSectionTitle">
                <CheckCircle2 size={16} color="#10b981" />
                <h3>Kết luận & Nhận định Chuyên sâu</h3>
              </div>
              <div className="sdConclusionsList">
                {deliverable.conclusions.map((c) => (
                  <div key={c.id} className="sdConclusionItem">
                    <div className={`sdImpactBadge impact-${c.impact}`}>
                      {c.impact === "high" ? "Trọng tâm" : c.impact === "medium" ? "Quan trọng" : "Lưu ý"}
                    </div>
                    <div>
                      <h4 className="sdConclusionTitle">{c.title}</h4>
                      <p className="sdConclusionDetail">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "insights" && (
            <div className="sdTabSection">
              <div className="sdSectionTitle">
                <TrendingUp size={16} color="#3b82f6" />
                <h3>Chỉ số Thị trường & Phân tích Cạnh tranh</h3>
              </div>
              <div className="sdInsightsGrid">
                {deliverable.marketInsights.map((insight, idx) => (
                  <div key={idx} className="sdInsightCard">
                    <div className="sdInsightTop">
                      <span className="sdInsightLabel">{insight.label}</span>
                      {insight.change && (
                        <span className="sdInsightChange">{insight.change}</span>
                      )}
                    </div>
                    <div className="sdInsightValue">{insight.value}</div>
                    <p className="sdInsightDesc">{insight.description}</p>
                  </div>
                ))}
              </div>

              {/* Distribution Channels Deep Dive */}
              <div className="sdChannelAnalysisBox">
                <h4 className="sdChannelTitle">Phân bổ Kênh Phân phối & Tiếp thị Mục tiêu</h4>
                <div className="sdChannelList">
                  <div className="sdChannelItem">
                    <div className="sdChannelName">TikTok Shop (Social Live Commerce)</div>
                    <div className="sdChannelBarWrap">
                      <div className="sdChannelBar fill-tiktok" style={{ width: "42%" }} />
                    </div>
                    <span className="sdChannelPercent">42%</span>
                  </div>
                  <div className="sdChannelItem">
                    <div className="sdChannelName">Shopee Mall (E-Commerce Truyền thống)</div>
                    <div className="sdChannelBarWrap">
                      <div className="sdChannelBar fill-shopee" style={{ width: "38%" }} />
                    </div>
                    <span className="sdChannelPercent">38%</span>
                  </div>
                  <div className="sdChannelItem">
                    <div className="sdChannelName">Storefront & Chuỗi Cửa hàng Bán lẻ</div>
                    <div className="sdChannelBarWrap">
                      <div className="sdChannelBar fill-storefront" style={{ width: "20%" }} />
                    </div>
                    <span className="sdChannelPercent">20%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "actionPlan" && (
            <div className="sdTabSection">
              <div className="sdSectionTitle">
                <LineChart size={16} color="#8b5cf6" />
                <h3>Lộ trình Hành động 3 Giai đoạn Ra mắt Thị trường</h3>
              </div>
              <div className="sdPhasesTimeline">
                {deliverable.actionPlan.map((phase, idx) => (
                  <div key={idx} className="sdPhaseCard">
                    <div className="sdPhaseHeader">
                      <div className="sdPhaseTag">{phase.phase}</div>
                      <h4 className="sdPhaseTitle">{phase.title}</h4>
                      <span className="sdPhaseDuration">{phase.duration}</span>
                    </div>
                    <ul className="sdTaskList">
                      {phase.tasks.map((task, tIdx) => (
                        <li key={tIdx} className="sdTaskItem">
                          <Check size={14} className="sdTaskCheck" />
                          <span>{task}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "risks" && (
            <div className="sdTabSection">
              <div className="sdSectionTitle">
                <ShieldAlert size={16} color="#ef4444" />
                <h3>Ma trận Quản trị Rủi ro & Biện pháp Phòng ngừa</h3>
              </div>
              <div className="sdRisksTable">
                {deliverable.risks.map((risk) => (
                  <div key={risk.id} className="sdRiskRow">
                    <div className="sdRiskLeft">
                      <span className={`sdSeverityBadge sev-${risk.severity}`}>
                        {risk.severity === "high" ? "Rủi ro Cao" : risk.severity === "medium" ? "Rủi ro Vừa" : "Rủi ro Thấp"}
                      </span>
                      <h4 className="sdRiskName">{risk.risk}</h4>
                    </div>
                    <div className="sdRiskRight">
                      <span className="sdMitigationLabel">Phương án khắc phục:</span>
                      <p className="sdMitigationText">{risk.mitigation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sdModalFooter">
          <div className="sdFooterMeta">
            <FileSpreadsheet size={16} color="#94a3b8" />
            <span>Tệp văn bản đính kèm: <strong>{deliverable.docxFilename}</strong></span>
          </div>
          <div className="sdFooterActions">
            <button
              type="button"
              onClick={handleCopySummary}
              className="sdBtnSecondary"
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? "Đã sao chép!" : "Sao chép Tóm tắt"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="sdBtnPrimary"
            >
              <Download size={14} />
              <span>{isDownloading ? "Đang chuẩn bị tệp..." : "Tải Báo cáo (.docx)"}</span>
            </button>

            {deliverable.taskId && onNavigateToTask && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToTask(deliverable.taskId!);
                }}
                className="sdBtnSecondary"
              >
                <ExternalLink size={14} />
                <span>Chi tiết Vận hành DAG</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="sdBtnClose"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
