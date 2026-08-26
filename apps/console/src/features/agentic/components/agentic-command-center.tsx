// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  History,
  CheckCircle2,
  Clock,
  Square,
  Play,
  TrendingUp,
  Bot,
  Layers,
  Activity,
  Building2,
  Users,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Package,
  ShoppingBag,
  Headphones,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { AgenticTaskOverview, AgenticTaskPage, AgenticTaskOperations } from "../types/agentic.types";
import "../styles/agentic-command-center.css";

interface AgenticCommandCenterProps {
  readonly api: AgenticOperationsApi;
  readonly overview?: AgenticTaskOverview;
  readonly tasks?: AgenticTaskPage;
  readonly onTaskCreated?: () => void;
}

interface AgentCardState {
  readonly name: string;
  readonly roleTag: "SKILL" | "TRỢ LÝ" | "ĐỘI";
  readonly department: "catalog" | "operations" | "support" | "finance";
  readonly status: "idle" | "running" | "completed";
  readonly contentText?: string;
  readonly showProgress?: boolean;
}

const INITIAL_AGENTS: readonly AgentCardState[] = [
  {
    name: "Cây bút Sản phẩm",
    roleTag: "SKILL",
    department: "catalog",
    status: "running",
    contentText: "Viết lại mô tả sản phẩm bộ sưu tập Thu Đông...",
  },
  {
    name: "Chuyên viên Merchandising",
    roleTag: "TRỢ LÝ",
    department: "catalog",
    status: "completed",
  },
  {
    name: "Kỹ sư Tồn kho",
    roleTag: "SKILL",
    department: "operations",
    status: "running",
    contentText: "Đang tính toán lại định mức tồn kho an toàn...",
    showProgress: true,
  },
  {
    name: "Điều phối Đơn hàng",
    roleTag: "ĐỘI",
    department: "operations",
    status: "completed",
  },
  {
    name: "Quản gia CSKH",
    roleTag: "TRỢ LÝ",
    department: "support",
    status: "idle",
  },
  {
    name: "Chuyên viên CRM",
    roleTag: "SKILL",
    department: "support",
    status: "completed",
  },
  {
    name: "Kiểm soát viên Tài chính",
    roleTag: "SKILL",
    department: "finance",
    status: "idle",
  },
];

export function AgenticCommandCenter({
  api,
  overview,
  tasks,
  onTaskCreated,
}: AgenticCommandCenterProps) {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"hub" | "orchestration" | "workforce">("hub");
  const [recentOutcomesOpen, setRecentOutcomesOpen] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(42);
  const [activeOperations, setActiveOperations] = useState<AgenticTaskOperations | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Poll operations if a live task is running
  useEffect(() => {
    if (!activeTaskId) return;

    const interval = setInterval(async () => {
      try {
        const ops = await api.loadOperations(activeTaskId);
        setActiveOperations(ops);
        if (["completed", "partially_completed", "failed", "canceled"].includes(ops.task.state)) {
          setActiveRunId(null);
        }
      } catch (err) {
        console.error("Failed to poll operations", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTaskId, api]);

  // Live timer for active reasoning
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSendStrategicTask = async (customGoal?: string) => {
    const goalText = (customGoal || prompt).trim();
    if (!goalText || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const idempotencyKey = crypto.randomUUID();
      const created = await api.createTask(
        {
          mode: "advanced",
          goal: goalText,
          instructions: `Thực hiện phân tích và lên kế hoạch tự động cho mục tiêu: ${goalText}`,
        },
        idempotencyKey,
      );

      const readied = await api.readyTask(created.task.id, created.task.version);
      const run = await api.startTask(readied.task.id, readied.task.version, 1);

      setActiveTaskId(created.task.id);
      setActiveRunId(run.id);
      setElapsedSeconds(0);
      setPrompt("");
      if (onTaskCreated) onTaskCreated();
    } catch (error) {
      console.error("Failed to execute strategic task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopTask = async () => {
    if (!activeRunId || !activeOperations?.workflow) return;
    try {
      await api.cancelWorkflow(activeRunId, activeOperations.workflow.version, "CANCELED_BY_STAFF");
      setActiveRunId(null);
    } catch (err) {
      console.error("Failed to stop workflow:", err);
    }
  };

  const handleAgentDirectTask = async (agentName: string, directPrompt: string) => {
    if (!directPrompt.trim()) return;
    await handleSendStrategicTask(`[${agentName}] ${directPrompt}`);
  };

  const activeCount = overview?.counts.running ?? 2;

  return (
    <section className="commandCenterWorkspace">
      {/* 1. Header Bar */}
      <header className="ccHeaderBar">
        <div className="ccBrandTitle">
          <Sparkles size={20} color="#f59e0b" />
          <span>OpenDX CompanyOS — Trung tâm điều hành AI</span>
        </div>

        <nav className="ccNavTabs">
          <button
            type="button"
            className={`ccNavTab ${activeTab === "hub" ? "active" : ""}`}
            onClick={() => setActiveTab("hub")}
          >
            Command Hub
          </button>
          <button
            type="button"
            className={`ccNavTab ${activeTab === "orchestration" ? "active" : ""}`}
            onClick={() => setActiveTab("orchestration")}
          >
            Orchestration
          </button>
          <button
            type="button"
            className={`ccNavTab ${activeTab === "workforce" ? "active" : ""}`}
            onClick={() => setActiveTab("workforce")}
          >
            Workforce
          </button>
        </nav>

        <div className="ccHeaderRight">
          <span className="ccStatBadge">4 Phòng ban</span>
          <span className="ccStatBadge">8 Nhân sự AI</span>
          <span className="ccStatBadge activeTasks">
            <span className="ccPillDot" />
            <span>{activeCount} Đang làm</span>
          </span>

          <div className="ccProfilePill">
            <div className="ccAvatar">
              <Bot size={14} color="#94a3b8" />
              <span className="ccAvatarOnline" />
            </div>
            <span>Chủ tịch (Owner)</span>
          </div>
        </div>
      </header>

      {/* 2. Strategic Command Card */}
      <div className="ccStrategicCard">
        <h1 className="ccStrategicTitle">Giao việc chiến lược</h1>

        <div className="ccInputWrapper">
          <Sparkles className="ccSparkleIcon" size={20} />
          <input
            type="text"
            className="ccMainPromptInput"
            placeholder="Hãy giao việc chiến lược cho AI CEO..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendStrategicTask();
            }}
          />
          <button
            type="button"
            className="ccSendButton"
            disabled={isSubmitting || !prompt.trim()}
            onClick={() => handleSendStrategicTask()}
          >
            <Play size={14} fill="currentColor" />
            <span>{isSubmitting ? "Đang gửi..." : "Gửi"}</span>
          </button>
        </div>

        {/* Quick Action Pills */}
        <div className="ccQuickActionRow">
          <button
            type="button"
            className="ccQuickPill"
            onClick={() => setRecentOutcomesOpen((prev) => !prev)}
          >
            <Clock size={13} />
            <span>Lịch sử (6)</span>
          </button>
          <button
            type="button"
            className="ccQuickPill"
            onClick={() => handleSendStrategicTask("Rà soát sức khỏe cửa hàng toàn diện")}
          >
            <span>Rà soát sức khỏe cửa hàng</span>
          </button>
          <button
            type="button"
            className="ccQuickPill"
            onClick={() => handleSendStrategicTask("Kiểm toán rủi ro tồn kho khẩn cấp")}
          >
            <span>Kiểm toán tồn kho</span>
          </button>
        </div>

        {/* Recent Outcomes Dropdown */}
        <div className="ccRecentOutcomesContainer">
          <div
            className="ccRecentOutcomesHeader"
            onClick={() => setRecentOutcomesOpen((prev) => !prev)}
          >
            <span>Recent Outcomes</span>
            {recentOutcomesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
          {recentOutcomesOpen && (
            <div className="ccRecentOutcomesList">
              <div className="ccRecentOutcomeItem">
                <CheckCircle2 size={16} className="ccCheckIcon" />
                <span>
                  <strong>Kiểm toán tồn kho xong...</strong> Đã phát hiện 3 SKU có nguy cơ đứt hàng và tạo cảnh báo bổ sung.
                </span>
              </div>
              <div className="ccRecentOutcomeItem">
                <CheckCircle2 size={16} className="ccCheckIcon" />
                <span>
                  <strong>Phân tích đơn hàng xong...</strong> 12 đơn hàng quá hạn 48h được chuyển sang bộ phận hỗ trợ xử lý.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Pipeline Flow Bar */}
      <div className="ccPipelineBar">
        <div className="ccPipelineSteps">
          <div className="ccPipelineNode active">
            <Bot size={14} />
            <span>AI CEO</span>
          </div>
          <ArrowRight className="ccPipelineArrow" size={14} />
          <div className="ccPipelineNode active">
            <Package size={14} />
            <span>Kỹ sư Tồn kho</span>
          </div>
          <ArrowRight className="ccPipelineArrow" size={14} />
          <div className="ccPipelineNode">
            <ShoppingBag size={14} />
            <span>Điều phối Đơn hàng</span>
          </div>
          <ArrowRight className="ccPipelineArrow" size={14} />
          <div className="ccPipelineNode">
            <Bot size={14} />
            <span>AI CEO Tổng hợp</span>
          </div>
        </div>

        <div className="ccPipelineStatus">
          <div className="ccReasoningIndicator">
            <span className="ccPulseDot" />
            <span>
              Đang suy luận... {Math.floor(elapsedSeconds / 60)}:
              {String(elapsedSeconds % 60).padStart(2, "0")}
            </span>
          </div>
          <button type="button" className="ccStopButton" onClick={handleStopTask}>
            <Square size={12} fill="currentColor" />
            <span>Dừng</span>
          </button>
        </div>
      </div>

      {/* 4. Department Workforce Grid */}
      <div className="ccDepartmentGrid">
        {/* Column 1: Catalog & Marketing */}
        <div className="ccDepartmentColumn">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <Layers size={16} color="#38bdf8" />
              <span>Catalog & Marketing</span>
            </div>
            <span className="ccDeptCountBadge amber">
              <span className="ccPillDot" style={{ width: 6, height: 6 }} />
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Cây bút Sản phẩm"
            roleTag="SKILL"
            status="running"
            statusText="Viết lại mô tả sản phẩm bộ sưu tập Thu Đông..."
            onSend={(text) => handleAgentDirectTask("Cây bút Sản phẩm", text)}
          />
          <AgentCard
            name="Chuyên viên Merchandising"
            roleTag="TRỢ LÝ"
            status="completed"
            onSend={(text) => handleAgentDirectTask("Chuyên viên Merchandising", text)}
          />
        </div>

        {/* Column 2: Vận hành */}
        <div className="ccDepartmentColumn">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <Package size={16} color="#fbbf24" />
              <span>Vận hành</span>
            </div>
            <span className="ccDeptCountBadge amber">
              <span className="ccPillDot" style={{ width: 6, height: 6 }} />
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Kỹ sư Tồn kho"
            roleTag="SKILL"
            status="running"
            statusText="Đang tính toán lại định mức tồn kho an toàn..."
            showProgress
            onSend={(text) => handleAgentDirectTask("Kỹ sư Tồn kho", text)}
          />
          <AgentCard
            name="Điều phối Đơn hàng"
            roleTag="ĐỘI"
            status="completed"
            onSend={(text) => handleAgentDirectTask("Điều phối Đơn hàng", text)}
          />
        </div>

        {/* Column 3: CSKH & Cộng đồng */}
        <div className="ccDepartmentColumn">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <Headphones size={16} color="#34d399" />
              <span>CSKH & Cộng đồng</span>
            </div>
            <span className="ccDeptCountBadge green">
              <Check size={12} />
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Quản gia CSKH"
            roleTag="TRỢ LÝ"
            status="idle"
            onSend={(text) => handleAgentDirectTask("Quản gia CSKH", text)}
          />
          <AgentCard
            name="Chuyên viên CRM"
            roleTag="SKILL"
            status="completed"
            onSend={(text) => handleAgentDirectTask("Chuyên viên CRM", text)}
          />
        </div>

        {/* Column 4: Tài chính */}
        <div className="ccDepartmentColumn">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <DollarSign size={16} color="#a78bfa" />
              <span>Tài chính</span>
            </div>
            <span className="ccDeptCountBadge green">
              <Check size={12} />
              <span>1 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Kiểm soát viên Tài chính"
            roleTag="SKILL"
            status="idle"
            onSend={(text) => handleAgentDirectTask("Kiểm soát viên Tài chính", text)}
          />
        </div>
      </div>
    </section>
  );
}

interface AgentCardProps {
  readonly name: string;
  readonly roleTag: "SKILL" | "TRỢ LÝ" | "ĐỘI";
  readonly status: "idle" | "running" | "completed";
  readonly statusText?: string;
  readonly showProgress?: boolean;
  readonly onSend: (input: string) => void;
}

function AgentCard({
  name,
  roleTag,
  status,
  statusText,
  showProgress,
  onSend,
}: AgentCardProps) {
  const [inlineInput, setInlineInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineInput.trim()) return;
    onSend(inlineInput);
    setInlineInput("");
  };

  return (
    <div className={`ccAgentCard ${status === "running" ? "activeThinking" : ""}`}>
      <div className="ccAgentCardHeader">
        <span className="ccAgentRoleBadge">{roleTag}</span>
        {status === "running" ? (
          <span className="ccStatusIndicatorDot teal" />
        ) : status === "completed" ? (
          <span className="ccStatusIndicatorIcon">
            <CheckCircle2 size={15} color="#10b981" />
          </span>
        ) : (
          <span className="ccStatusIndicatorDot gray" />
        )}
      </div>

      <h3 className="ccAgentName">{name}</h3>

      {statusText && (
        <p className={`ccAgentContentText ${showProgress ? "activeCalc" : ""}`}>
          {statusText}
        </p>
      )}

      {showProgress && (
        <div className="ccProgressBarContainer">
          <div className="ccProgressBarFill" />
        </div>
      )}

      <form className="ccAgentInputWrapper" onSubmit={handleSubmit}>
        <input
          type="text"
          className="ccAgentMiniInput"
          placeholder="Giao việc..."
          value={inlineInput}
          onChange={(e) => setInlineInput(e.target.value)}
        />
        <button type="submit" className="ccAgentSendBtn" title="Gửi">
          <Send size={12} />
        </button>
      </form>
    </div>
  );
}
