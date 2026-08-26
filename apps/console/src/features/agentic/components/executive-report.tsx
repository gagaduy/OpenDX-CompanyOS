// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  AlertOctagon,
  ChevronRight,
  Check,
  Layers,
  Sparkles,
} from "lucide-react";
import type { AgenticExecutiveReport } from "../types/agentic.types";

export interface ExecutiveReportProps {
  readonly report?: AgenticExecutiveReport;
  readonly workflowState: string;
}

export function ExecutiveReport({ report, workflowState }: ExecutiveReportProps) {
  const [activeFilter, setActiveFilter] = useState<"all" | "conclusions" | "risks" | "actions">("all");

  if (report === undefined) {
    return (
      <section className="executiveReportCard empty">
        <div className="erHeader">
          <div className="erTitle">
            <FileText size={18} color="#94a3b8" />
            <span>Báo cáo Tổng hợp Điều hành (Executive Report)</span>
          </div>
        </div>
        <div className="erEmptyState">
          <p>
            {["completed", "partially_completed"].includes(workflowState)
              ? "Chưa có bản báo cáo tổng hợp nào được lưu vết."
              : "Đang chờ AI CEO tổng hợp dữ liệu từ các phòng ban để xuất bản báo cáo..."}
          </p>
        </div>
      </section>
    );
  }

  const isComplete = report.completionState === "complete";

  return (
    <section className="executiveReportCard">
      {/* 1. Header with Badge & Title */}
      <div className="erHeader">
        <div className="erTitle">
          <Sparkles size={20} color="#f59e0b" />
          <h2>Báo cáo Tổng hợp Điều hành (Executive Report)</h2>
        </div>
        <div className="erStatusBadge">
          {isComplete ? (
            <span className="erBadge green">
              <CheckCircle2 size={14} />
              <span>Hoàn thành toàn diện (Complete)</span>
            </span>
          ) : (
            <span className="erBadge amber">
              <AlertTriangle size={14} />
              <span>Hoàn thành một phần (Partial Findings)</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Executive Summary Hero Box */}
      <div className="erSummaryBox">
        <h4 className="erSectionLabel">Tóm tắt Chiến lược (Executive Summary)</h4>
        <p className="erSummaryText">{report.summary}</p>
      </div>

      {/* 3. Filter Tabs */}
      <div className="erFilterRow">
        <button
          type="button"
          className={`erFilterTab ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          Tất cả phát hiện ({report.conclusions.length + report.risks.length + report.recommendedActions.length})
        </button>
        <button
          type="button"
          className={`erFilterTab ${activeFilter === "conclusions" ? "active" : ""}`}
          onClick={() => setActiveFilter("conclusions")}
        >
          <CheckCircle2 size={14} color="#10b981" />
          <span>Kết luận & Số liệu ({report.conclusions.length})</span>
        </button>
        <button
          type="button"
          className={`erFilterTab ${activeFilter === "risks" ? "active" : ""}`}
          onClick={() => setActiveFilter("risks")}
        >
          <AlertOctagon size={14} color="#ef4444" />
          <span>Rủi ro & Cảnh báo ({report.risks.length})</span>
        </button>
        <button
          type="button"
          className={`erFilterTab ${activeFilter === "actions" ? "active" : ""}`}
          onClick={() => setActiveFilter("actions")}
        >
          <TrendingUp size={14} color="#38bdf8" />
          <span>Khuyến nghị hành động ({report.recommendedActions.length})</span>
        </button>
      </div>

      {/* 4. Detailed Grid of Findings */}
      <div className="erGridContainer">
        {/* Conclusions Column/Cards */}
        {(activeFilter === "all" || activeFilter === "conclusions") && report.conclusions.length > 0 && (
          <div className="erSectionGroup">
            <h3 className="erGroupTitle conclusions">
              <CheckCircle2 size={16} />
              <span>Phát hiện & Số liệu Thực tế</span>
            </h3>
            <div className="erCardList">
              {report.conclusions.map((item) => (
                <div key={item.code} className="erItemCard conclusion">
                  <div className="erItemHeader">
                    <span className="erItemCode">{item.code}</span>
                    <span className="erItemTag">XÁC THỰC DỮ LIỆU</span>
                  </div>
                  <p className="erItemStatement">{item.statement}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risks Column/Cards */}
        {(activeFilter === "all" || activeFilter === "risks") && report.risks.length > 0 && (
          <div className="erSectionGroup">
            <h3 className="erGroupTitle risks">
              <AlertOctagon size={16} />
              <span>Cảnh báo Rủi ro & Điểm nóng</span>
            </h3>
            <div className="erCardList">
              {report.risks.map((item) => (
                <div key={item.code} className={`erItemCard risk ${item.severity}`}>
                  <div className="erItemHeader">
                    <span className="erItemCode">{item.code}</span>
                    <span className={`erSeverityBadge ${item.severity}`}>
                      {item.severity.toUpperCase()} RISK
                    </span>
                  </div>
                  <p className="erItemStatement">{item.statement}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Actions Column/Cards */}
        {(activeFilter === "all" || activeFilter === "actions") && report.recommendedActions.length > 0 && (
          <div className="erSectionGroup">
            <h3 className="erGroupTitle actions">
              <TrendingUp size={16} />
              <span>Khuyến nghị Hành động Tiếp theo</span>
            </h3>
            <div className="erCardList">
              {report.recommendedActions.map((item) => (
                <div key={item.code} className="erItemCard action">
                  <div className="erItemHeader">
                    <span className="erItemCode">{item.code}</span>
                    {item.requiresHumanApproval && (
                      <span className="erApprovalBadge">
                        <ShieldCheck size={13} />
                        <span>Cần duyệt</span>
                      </span>
                    )}
                  </div>
                  <p className="erItemStatement">{item.statement}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. Unavailable Departments note if any */}
      {report.unavailableBranches.length > 0 && (
        <div className="erUnavailableBox">
          <h4 className="erUnavailableTitle">
            <AlertTriangle size={15} color="#f59e0b" />
            <span>Phòng ban chưa gửi kịp dữ liệu đợt này ({report.unavailableBranches.length})</span>
          </h4>
          <div className="erUnavailableList">
            {report.unavailableBranches.map(({ subtaskId, reasonCode }) => (
              <span key={subtaskId} className="erUnavailableTag">
                {title(subtaskId)}: <em>{reasonCode}</em>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function title(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
