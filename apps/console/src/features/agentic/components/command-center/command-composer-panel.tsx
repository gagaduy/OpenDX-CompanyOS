// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useRef } from "react";
import {
  Send,
  Square,
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
  Building2,
  Eye,
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
  ceoPlan,
  onResetCeoPlan,
  onViewDeliverable,
  onStop,
}) => {
  const [activeMetaTab, setActiveMetaTab] = useState<"none" | "context" | "goal">("none");
  const [contextValue, setContextValue] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; size: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleSubmit = () => {
    if (!prompt.trim() || isSubmitting) return;
    onSubmit({
      prompt: prompt.trim(),
      context: contextValue.trim() || undefined,
      goalTarget: goalValue.trim() || undefined,
      attachments: attachedFiles.length > 0 ? attachedFiles : undefined,
      priority,
      target: targetDepartment,
    });
    setAttachedFiles([]);
    setContextValue("");
    setGoalValue("");
    setActiveMetaTab("none");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
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

          {/* Attached Files Chips */}
          {attachedFiles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
              {attachedFiles.map((file, idx) => (
                <span
                  key={`${file.name}-${idx}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "rgba(30, 41, 59, 0.85)",
                    border: "1px solid rgba(59, 130, 246, 0.35)",
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "0.72rem",
                    color: "#93c5fd",
                  }}
                >
                  <Paperclip size={11} />
                  <span>{file.name}</span>
                  <span style={{ color: "#64748b", fontSize: "0.68rem" }}>
                    ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      padding: "0 2px",
                      marginLeft: "2px",
                      fontSize: "0.75rem",
                      lineHeight: 1,
                    }}
                    title="Xóa tệp đính kèm"
                    aria-label={`Xóa tệp ${file.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Context / Goal Expandable Inputs */}
          {activeMetaTab === "context" && (
            <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#07090e", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                <label style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Bối cảnh chiến dịch / thị trường:</label>
                {contextValue && (
                  <button
                    type="button"
                    onClick={() => setContextValue("")}
                    style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.68rem" }}
                  >
                    Xóa
                  </button>
                )}
              </div>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                <label style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Mục tiêu cụ thể (KPI target):</label>
                {goalValue && (
                  <button
                    type="button"
                    onClick={() => setGoalValue("")}
                    style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.68rem" }}
                  >
                    Xóa
                  </button>
                )}
              </div>
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              data-testid="cc-file-input"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  const newFiles = files.map((f) => ({ name: f.name, size: f.size }));
                  setAttachedFiles((prev) => [...prev, ...newFiles]);
                }
                e.target.value = "";
              }}
            />

            <button
              type="button"
              className="ccToolBtn"
              title={attachedFiles.length > 0 ? `Đã đính kèm ${attachedFiles.length} tệp` : "Đính kèm tài liệu phân tích"}
              onClick={() => fileInputRef.current?.click()}
              style={
                attachedFiles.length > 0
                  ? { background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.4)" }
                  : undefined
              }
            >
              <Paperclip size={13} />
              <span>{attachedFiles.length > 0 ? `Đính kèm (${attachedFiles.length})` : "Đính kèm"}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMetaTab(activeMetaTab === "context" ? "none" : "context")}
              className="ccToolBtn"
              style={
                activeMetaTab === "context" || contextValue.trim()
                  ? { background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.4)" }
                  : undefined
              }
              title={contextValue.trim() ? `Bối cảnh: ${contextValue}` : "Thêm bối cảnh chiến dịch"}
            >
              <Globe size={13} />
              <span>{contextValue.trim() ? "Bối cảnh ✓" : "Bối cảnh"}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMetaTab(activeMetaTab === "goal" ? "none" : "goal")}
              className="ccToolBtn"
              style={
                activeMetaTab === "goal" || goalValue.trim()
                  ? { background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.4)" }
                  : undefined
              }
              title={goalValue.trim() ? `Mục tiêu KPI: ${goalValue}` : "Thêm chỉ số KPI mục tiêu"}
            >
              <Target size={13} />
              <span>{goalValue.trim() ? "Mục tiêu ✓" : "Mục tiêu"}</span>
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

            {isSubmitting ? (
              <button
                type="button"
                aria-label="Dừng lại"
                onClick={() => onStop?.()}
                className="ccStopBtn"
              >
                <Square size={13} fill="currentColor" />
                <span>Dừng lại</span>
              </button>
            ) : (
              <button
                type="button"
                aria-label="Gửi"
                disabled={!prompt.trim()}
                onClick={handleSubmit}
                className="ccSubmitBtn"
              >
                <Send size={13} />
                <span>Giao việc</span>
              </button>
            )}
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
                if (tmpl.target) {
                  onTargetDepartmentChange(tmpl.target);
                }
                if (tmpl.priority) {
                  onPriorityChange(tmpl.priority);
                }
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
                {ceoPlan ? (
                  ceoPlan.steps.length > 0 && ceoPlan.steps.every((s) => s.status === "done") ? (
                    <span className="ccCeoBadge done">
                      <CheckCircle2 size={11} style={{ color: "#22c55e" }} />
                      <span>Đã hoàn thành</span>
                    </span>
                  ) : ceoPlan.steps.some((s) => s.status === "running") ? (
                    <span className="ccCeoBadge running">
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#38bdf8", display: "inline-block" }} className="animate-pulse" />
                      <span>Đang thực thi...</span>
                    </span>
                  ) : (
                    <span className="ccCeoBadge" style={{ background: "rgba(234, 179, 8, 0.15)", borderColor: "rgba(234, 179, 8, 0.3)", color: "#facc15" }}>
                      <Clock size={11} />
                      <span>Chờ phê duyệt</span>
                    </span>
                  )
                ) : (
                  <span className="ccCeoBadge">
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: isAnalyzing ? "#38bdf8" : "#22c55e",
                        display: "inline-block",
                      }}
                      className={isAnalyzing ? "animate-pulse" : ""}
                    />
                    {isAnalyzing
                      ? "Đang phân tích..."
                      : prompt.trim().length > 0
                        ? "Đang tiếp nhận..."
                        : "Sẵn sàng"}
                  </span>
                )}
              </div>
            </div>

            <div className="ccCeoTimer">
              <Clock size={12} style={{ color: "#38bdf8", marginRight: "3px", display: "inline" }} />
              <span>{formatTimer(analysisDurationSeconds)}</span>
            </div>
          </div>

          {/* Motivational quote or active goal */}
          <div className="ccCeoQuote">
            {ceoPlan ? (
              ceoPlan.steps.length > 0 && ceoPlan.steps.every((s) => s.status === "done")
                ? `“✓ AI CEO đã hoàn tất điều phối tác vụ cho ${ceoPlan.targetDept}.”`
                : `“Mục tiêu: ${ceoPlan.goal.length > 55 ? `${ceoPlan.goal.slice(0, 52)}...` : ceoPlan.goal}”`
            ) : isAnalyzing ? (
              "“Đã hiểu mục tiêu. Đang phân tích, lập kế hoạch và phân bổ nguồn lực phù hợp...”"
            ) : prompt.trim().length > 0 ? (
              "“Đang tiếp nhận chỉ đạo chiến lược. Dự kiến phân công phòng ban phù hợp...”"
            ) : (
              "“Hệ thống AI CEO sẵn sàng tiếp nhận mục tiêu chiến lược và điều phối nguồn lực doanh nghiệp.”"
            )}
          </div>

          {/* Target Department Badge when CeoPlan is present */}
          {ceoPlan?.targetDept && (
            <div className="ccCeoTargetBadge">
              <Building2 size={12} />
              <span>{ceoPlan.targetDept}</span>
            </div>
          )}

          {/* Stepper list: Dynamic CeoPlan Steps or 4 Canonical Intake Steps */}
          <div className="ccCeoStepper">
            {ceoPlan ? (
              ceoPlan.steps.map((s, idx) => {
                const isDone = s.status === "done";
                const isRunning = s.status === "running";

                return (
                  <div
                    key={idx}
                    className={`ccCeoStep ${isRunning ? "active" : isDone ? "done" : "pending"}`}
                    style={{ alignItems: "flex-start", gap: "0.45rem" }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={14} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
                    ) : isRunning ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: "#38bdf8", flexShrink: 0, marginTop: "2px" }} />
                    ) : (
                      <Clock size={14} style={{ color: "#64748b", flexShrink: 0, marginTop: "2px" }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "0.74rem", fontWeight: isRunning ? 700 : isDone ? 600 : 500, color: isRunning ? "#ffffff" : isDone ? "#e2e8f0" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.role}
                        </span>
                        <span style={{ fontSize: "0.62rem", padding: "1px 5px", borderRadius: "3px", background: isDone ? "rgba(34, 197, 94, 0.15)" : isRunning ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.05)", color: isDone ? "#4ade80" : isRunning ? "#38bdf8" : "#64748b", flexShrink: 0 }}>
                          {isDone ? "Xong" : isRunning ? "Đang chạy" : "Chờ"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.task}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              steps.map((s) => {
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
                      <Target size={14} style={{ color: "#38bdf8", flexShrink: 0 }} className="animate-pulse" />
                    ) : (
                      <span className="ccCeoStepNum">{s.num}</span>
                    )}
                    <span>{s.label}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Action buttons when CeoPlan is complete */}
          {ceoPlan && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
              {onViewDeliverable && (
                <button
                  type="button"
                  onClick={onViewDeliverable}
                  className="ccCeoActionBtn primary"
                >
                  <Eye size={12} />
                  <span>Xem kết quả</span>
                </button>
              )}
              {onResetCeoPlan && (
                <button
                  type="button"
                  onClick={onResetCeoPlan}
                  className="ccCeoActionBtn secondary"
                >
                  <span>+ Giao việc mới</span>
                </button>
              )}
            </div>
          )}
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
