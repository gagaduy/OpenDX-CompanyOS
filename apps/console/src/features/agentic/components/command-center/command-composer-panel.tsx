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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
      {/* Left 7/12 (approx 60-65%): Command Composer */}
      <div className="lg:col-span-8 bg-[#0a0b10] border border-white/[0.08] rounded-xl p-4 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sparkles size={15} className="text-[#5e6ad2]" />
              <span>Ra lệnh chiến lược cho AI CEO</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              Ctrl + Enter để gửi
            </span>
          </div>

          <div className="relative">
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hãy giao việc chiến lược cho AI CEO (Ví dụ: Phân tích thị trường mỹ phẩm Đông Nam Á và xây dựng kế hoạch ra mắt sản phẩm mới tại Việt Nam...)"
              className="w-full bg-[#11131a] text-slate-100 text-xs rounded-lg p-3 border border-white/[0.08] focus:border-[#5e6ad2]/80 focus:ring-1 focus:ring-[#5e6ad2]/50 placeholder:text-slate-500 resize-none transition-all outline-none"
            />
          </div>

          {/* Context / Goal Expandable Inputs */}
          {activeMetaTab === "context" && (
            <div className="mt-2 p-2 bg-[#11131a] rounded-lg border border-white/[0.06] text-xs">
              <label className="text-[11px] text-slate-400 block mb-1">Bối cảnh chiến dịch / thị trường:</label>
              <input
                type="text"
                value={contextValue}
                onChange={(e) => setContextValue(e.target.value)}
                placeholder="Nhập ghi chú bối cảnh kinh doanh..."
                className="w-full bg-[#0a0b10] border border-white/[0.08] rounded px-2 py-1 text-xs text-slate-200 outline-none"
              />
            </div>
          )}

          {activeMetaTab === "goal" && (
            <div className="mt-2 p-2 bg-[#11131a] rounded-lg border border-white/[0.06] text-xs">
              <label className="text-[11px] text-slate-400 block mb-1">Mục tiêu cụ thể (KPI target):</label>
              <input
                type="text"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                placeholder="VD: Tăng 20% doanh thu trong 30 ngày..."
                className="w-full bg-[#0a0b10] border border-white/[0.08] rounded px-2 py-1 text-xs text-slate-200 outline-none"
              />
            </div>
          )}
        </div>

        {/* Toolbar & Actions */}
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
              title="Đính kèm tài liệu phân tích"
            >
              <Paperclip size={13} />
              <span>Đính kèm</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMetaTab(activeMetaTab === "context" ? "none" : "context")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                activeMetaTab === "context"
                  ? "bg-[#5e6ad2]/20 text-[#5e6ad2]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`}
            >
              <Globe size={13} />
              <span>Bối cảnh</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMetaTab(activeMetaTab === "goal" ? "none" : "goal")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                activeMetaTab === "goal"
                  ? "bg-[#5e6ad2]/20 text-[#5e6ad2]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`}
            >
              <Target size={13} />
              <span>Mục tiêu</span>
            </button>

            <div className="relative inline-flex items-center ml-1">
              <select
                value={priority}
                onChange={(e) => onPriorityChange(e.target.value as any)}
                className="appearance-none bg-[#11131a] text-slate-300 text-xs border border-white/[0.08] rounded px-2.5 py-1 pr-6 hover:bg-white/[0.04] cursor-pointer outline-none"
              >
                <option value="low">Độ ưu tiên: Thấp</option>
                <option value="normal">Độ ưu tiên: Vừa</option>
                <option value="high">Độ ưu tiên: Cao</option>
                <option value="urgent">Độ ưu tiên: Khẩn cấp</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={targetDepartment}
                onChange={(e) => onTargetDepartmentChange(e.target.value)}
                className="appearance-none bg-[#11131a] text-slate-200 text-xs border border-white/[0.08] rounded-lg px-3 py-1.5 pr-7 font-medium hover:bg-white/[0.04] cursor-pointer outline-none"
              >
                <option value="ai_ceo">NovaAI CEO</option>
                <option value="marketing">Tiếp thị & Sáng tạo</option>
                <option value="merchandising">Danh mục & Định giá</option>
                <option value="operations">Vận hành & Kho vận</option>
                <option value="support">CSKH & Trải nghiệm</option>
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            <button
              type="button"
              aria-label={isSubmitting ? "Đang gửi..." : "Gửi"}
              disabled={isSubmitting || !prompt.trim()}
              onClick={onSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#5e6ad2] text-white hover:bg-[#4d59c0] disabled:opacity-50 disabled:cursor-not-allowed shadow transition-all focus:ring-2 focus:ring-[#5e6ad2]/50"
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
        <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
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
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#11131a] text-slate-300 border border-white/[0.06] hover:border-white/20 hover:text-white transition-all whitespace-nowrap"
            >
              <Zap size={11} className="text-[#5e6ad2]" />
              <span>{tmpl.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right 5/12 (approx 35-40%): AI CEO Live Stepper Card */}
      <div className="lg:col-span-4 bg-[#0a0b10] border border-white/[0.08] rounded-xl p-4 flex flex-col justify-between shadow-sm">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-full bg-[#5e6ad2]/20 border border-[#5e6ad2]/40 flex items-center justify-center">
                <Bot size={18} className="text-[#5e6ad2]" />
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#0a0b10]" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white leading-none">AI CEO</h3>
                <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1 mt-0.5">
                  {isAnalyzing ? "Đang phân tích..." : "Sẵn sàng"}
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#11131a] border border-white/[0.06] text-xs font-mono text-slate-300">
              <Clock size={12} className="text-slate-400" />
              <span>{formatTimer(analysisDurationSeconds)}</span>
            </div>
          </div>

          {/* Motivational quote when idle / prompt summary when analyzing */}
          <div className="py-2.5 text-xs text-slate-400 italic">
            &ldquo;Đã hiểu mục tiêu. Đang phân tích, lập kế hoạch và phân bổ nguồn lực phù hợp...&rdquo;
          </div>

          {/* Stepper list */}
          <div className="space-y-2 my-1">
            {steps.map((s) => {
              const isDone = analysisStep > s.num;
              const isCurrent = analysisStep === s.num;

              return (
                <div
                  key={s.num}
                  className={`flex items-center gap-2 text-xs py-1 px-2 rounded transition-colors ${
                    isCurrent
                      ? "bg-[#5e6ad2]/10 text-white font-medium"
                      : isDone
                      ? "text-slate-300"
                      : "text-slate-500"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 size={14} className="text-[#5e6ad2] animate-spin shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0 inline-block" />
                  )}
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer quote badge */}
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] text-[11px] text-slate-400">
          <p className="font-semibold text-slate-300 leading-tight">Từ chiến lược đến kết quả thực tế.</p>
          <p className="text-[10px] text-slate-500 mt-0.5">AI × Con người × Quy trình = Tăng trưởng thật.</p>
        </div>
      </div>
    </div>
  );
};
