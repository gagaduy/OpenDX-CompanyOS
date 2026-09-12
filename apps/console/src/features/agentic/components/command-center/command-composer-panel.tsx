// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from "react";
import {
  Send,
  Sparkles,
  Paperclip,
  Globe,
  Target,
  Zap,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronDown,
} from "lucide-react";
import type { CommandComposerProps, QuickActionTemplate } from "./types";

const DEFAULT_TEMPLATES: QuickActionTemplate[] = [
  {
    id: "mkt-sea",
    label: "Phân tích thị trường",
    prompt: "Phân tích thị trường mỹ phẩm Đông Nam Á và xây dựng kế hoạch ra mắt sản phẩm mới tại Việt Nam...",
    target: "ai_ceo",
    priority: "high",
  },
  {
    id: "prod-launch",
    label: "Ra mắt sản phẩm",
    prompt: "Lập kế hoạch chiến dịch ra mắt dòng sản phẩm công nghệ thế hệ mới kèm nội dung đa kênh và khuyến mãi...",
    target: "ai_ceo",
    priority: "normal",
  },
  {
    id: "inv-opt",
    label: "Tối ưu tồn kho",
    prompt: "Rà soát toàn bộ tồn kho các mặt hàng chủ lực, phân tích tốc độ bán 7 ngày và lập dự thảo đơn nhập hàng...",
    target: "operations",
    priority: "high",
  },
  {
    id: "crm-review",
    label: "Rà soát CSKH",
    prompt: "Xác định các giỏ hàng bị bỏ quên trong 24 giờ qua và kích hoạt quy trình gửi mã voucher ưu đãi cá nhân hóa...",
    target: "support",
    priority: "normal",
  },
];

export const CommandComposerPanel: React.FC<CommandComposerProps> = ({
  prompt,
  onPromptChange,
  onSubmit,
  isSubmitting,
  isAnalyzing,
  analysisStep,
  analysisDurationSeconds,
  priority,
  onPriorityChange,
  targetDepartment,
  onTargetDepartmentChange,
  onSelectTemplate,
}) => {
  const [activeMetaTab, setActiveMetaTab] = useState<"none" | "context" | "goal">("none");
  const [contextValue, setContextValue] = useState("");
  const [goalValue, setGoalValue] = useState("");

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `00:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const steps = [
    { num: 1, label: "Phân tích yêu cầu" },
    { num: 2, label: "Xác định phạm vi & mục tiêu" },
    { num: 3, label: "Lựa chọn phòng ban phù hợp" },
    { num: 4, label: "Tạo tác vụ và phân công nhân sự AI" },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (prompt.trim() && !isSubmitting) {
        onSubmit();
      }
    }
  };

  return (
    <div className="ccComposerGrid">
      {/* Left (approx 60-65%): Command Composer */}
      <div className="ccStrategicCard">
        <div>
          <div className="ccStrategicHeader">
            <h2 className="ccStrategicTitle">
              <Sparkles size={15} />
              <span>Ra lệnh chiến lược cho AI CEO</span>
            </h2>
            <span className="ccStrategicHint">
              Ctrl + Enter để gửi
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hãy giao việc chiến lược cho AI CEO (Ví dụ: Phân tích thị trường mỹ phẩm Đông Nam Á và xây dựng kế hoạch ra mắt sản phẩm mới tại Việt Nam...)"
              className="ccStrategicTextarea"
            />
          </div>

          {/* Context / Goal Expandable Inputs */}
          {activeMetaTab === "context" && (
            <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#07090e", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: "0.75rem" }}>
              <label style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block", marginBottom: "3px" }}>Bối cảnh chiến dịch / thị trường:</label>
              <input
                type="text"
                value={contextValue}
                onChange={(e) => setContextValue(e.target.value)}
                placeholder="Nhập ghi chú bối cảnh kinh doanh..."
                style={{ width: "100%", background: "#0d121f", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "4px", padding: "4px 8px", fontSize: "0.75rem", color: "#f8fafc", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          )}

          {activeMetaTab === "goal" && (
            <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#07090e", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: "0.75rem" }}>
              <label style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block", marginBottom: "3px" }}>Mục tiêu cụ thể (KPI target):</label>
              <input
                type="text"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                placeholder="VD: Tăng 20% doanh thu trong 30 ngày..."
                style={{ width: "100%", background: "#0d121f", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "4px", padding: "4px 8px", fontSize: "0.75rem", color: "#f8fafc", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          )}
        </div>

        {/* Toolbar & Actions */}
        <div className="ccStrategicToolbar">
          <div className="ccToolbarLeft">
            <button
              type="button"
              className="ccToolBtn"
              title="Đính kèm tài liệu phân tích"
            >
              <Paperclip size={13} />
              <span>Đính kèm</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMetaTab(activeMetaTab === "context" ? "none" : "context")}
              className="ccToolBtn"
              style={activeMetaTab === "context" ? { background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.4)" } : undefined}
            >
              <Globe size={13} />
              <span>Bối cảnh</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMetaTab(activeMetaTab === "goal" ? "none" : "goal")}
              className="ccToolBtn"
              style={activeMetaTab === "goal" ? { background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.4)" } : undefined}
            >
              <Target size={13} />
              <span>Mục tiêu</span>
            </button>

            <div style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "2px" }}>
              <select
                value={priority}
                onChange={(e) => onPriorityChange(e.target.value as any)}
                className="ccToolBtn"
                style={{ paddingRight: "18px", appearance: "none" }}
              >
                <option value="low">Độ ưu tiên: Thấp</option>
                <option value="normal">Độ ưu tiên: Vừa</option>
                <option value="high">Độ ưu tiên: Cao</option>
                <option value="urgent">Độ ưu tiên: Khẩn cấp</option>
              </select>
              <ChevronDown size={11} style={{ position: "absolute", right: "6px", pointerEvents: "none", color: "#64748b" }} />
            </div>
          </div>

          <div className="ccToolbarRight">
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                value={targetDepartment}
                onChange={(e) => onTargetDepartmentChange(e.target.value)}
                className="ccTargetSelect"
                style={{ paddingRight: "22px", appearance: "none" }}
              >
                <option value="ai_ceo">NovaAI CEO</option>
                <option value="marketing">Tiếp thị & Sáng tạo</option>
                <option value="merchandising">Danh mục & Định giá</option>
                <option value="operations">Vận hành & Kho vận</option>
                <option value="support">CSKH & Trải nghiệm</option>
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: "7px", pointerEvents: "none", color: "#64748b" }} />
            </div>

            <button
              type="button"
              aria-label={isSubmitting ? "Đang gửi..." : "Gửi"}
              disabled={isSubmitting || !prompt.trim()}
              onClick={onSubmit}
              className="ccSubmitBtn"
            >
              {isSubmitting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Send size={13} />
              )}
              <span>Giao việc</span>
            </button>
          </div>
        </div>

        {/* Quick Action Chips */}
        <div className="ccQuickSuggestions">
          <span className="ccQuickLabel">
            Gợi ý nhanh:
          </span>
          {DEFAULT_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => {
                onPromptChange(tmpl.prompt);
                onSelectTemplate(tmpl);
              }}
              className="ccQuickChip"
            >
              <Zap size={11} style={{ color: "#60a5fa", display: "inline", marginRight: "3px" }} />
              <span>{tmpl.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Column 2 (approx 30%): AI CEO Live Stepper Card */}
      <div className="ccCeoCard">
        <div>
          {/* Header */}
          <div className="ccCeoHeader">
            <div className="ccCeoIdentity">
              <div className="ccCeoAvatar">
                <Bot size={18} />
              </div>
              <div>
                <h3 className="ccCeoName">AI CEO</h3>
                <span className="ccCeoBadge">
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} className="animate-pulse" />
                  {isAnalyzing ? "Đang phân tích..." : "Sẵn sàng"}
                </span>
              </div>
            </div>

            <div className="ccCeoTimer">
              <Clock size={12} style={{ color: "#38bdf8", marginRight: "3px", display: "inline" }} />
              <span>{formatTimer(analysisDurationSeconds)}</span>
            </div>
          </div>

          {/* Motivational quote */}
          <div className="ccCeoQuote">
            &ldquo;Đã hiểu mục tiêu. Đang phân tích, lập kế hoạch và phân bổ nguồn lực phù hợp...&rdquo;
          </div>

          {/* Stepper list */}
          <div className="ccCeoStepper">
            {steps.map((s) => {
              const isDone = analysisStep > s.num;
              const isCurrent = analysisStep === s.num;

              return (
                <div
                  key={s.num}
                  className={`ccCeoStep ${isCurrent ? "active" : isDone ? "done" : "pending"}`}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                  ) : isCurrent ? (
                    <Target size={14} style={{ color: "#38bdf8", flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid #475569", flexShrink: 0, display: "inline-block" }} />
                  )}
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Column 3 (approx 15-20%): Strategic Vision Slogan Card */}
      <div className="ccSloganCard">
        <div className="ccSloganHeader">
          <span className="ccSloganBlue">Từ chiến lược</span>
          <span className="ccSloganWhite">đến kết quả thực tế.</span>
        </div>
        <p className="ccSloganFormula">
          AI × Con người × Quy trình = Tăng trưởng thật.
        </p>
      </div>
    </div>
  );
};
