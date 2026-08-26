// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
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
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { AgenticTaskOverview, AgenticTaskPage, AgenticTaskOperations } from "../types/agentic.types";
import { ExecutiveReport } from "./executive-report";
import "../styles/agentic-command-center.css";

interface AgenticCommandCenterProps {
  readonly api: AgenticOperationsApi;
  readonly overview?: AgenticTaskOverview;
  readonly tasks?: AgenticTaskPage;
  readonly onTaskCreated?: () => void;
}

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
  
  // Active task state
  const latestTask = tasks?.items?.[0];
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeOperations, setActiveOperations] = useState<AgenticTaskOperations | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Initialize with latest active or completed task
  useEffect(() => {
    if (!activeTaskId && latestTask?.id) {
      setActiveTaskId(latestTask.id);
    }
  }, [activeTaskId, latestTask?.id]);

  // Poll operations when a task is active
  useEffect(() => {
    if (!activeTaskId) return;

    let isMounted = true;
    const fetchOps = async () => {
      try {
        const ops = await api.loadOperations(activeTaskId);
        if (isMounted) {
          setActiveOperations(ops);
          if (ops.workflow) {
            setActiveRunId(ops.workflow.id);
          }
        }
      } catch (err) {
        console.error("Failed to load task operations:", err);
      }
    };

    fetchOps();
    const interval = setInterval(fetchOps, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeTaskId, api]);

  const currentWorkflowState = activeOperations?.workflow?.state ?? activeOperations?.task.state ?? latestTask?.state ?? "idle";
  const isRunning = [
    "planning",
    "awaiting_plan_approval",
    "dispatching",
    "department_analysis",
    "quality_review",
    "collaboration",
    "executive_synthesis",
    "retrying",
  ].includes(currentWorkflowState);

  // Timer effect only when running
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleSendStrategicTask = async (customGoal?: string, customInstructions?: string) => {
    const goalText = (customGoal || prompt).trim();
    if (!goalText || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const idempotencyKey = crypto.randomUUID();
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const created = await api.createTask(
        {
          mode: "store_health_review",
          goal: goalText,
          instructions: customInstructions || `Rà soát toàn diện và phân tích rủi ro thực tế cho mục tiêu: ${goalText}`,
          reviewWindow: {
            start: thirtyDaysAgo.toISOString().slice(0, 10),
            end: now.toISOString().slice(0, 10),
          },
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
      const updated = await api.loadOperations(activeOperations.task.id);
      setActiveOperations(updated);
    } catch (err) {
      console.error("Failed to stop workflow:", err);
    }
  };

  const handleAgentDirectTask = async (agentName: string, directPrompt: string) => {
    if (!directPrompt.trim()) return;
    await handleSendStrategicTask(
      `Yêu cầu trực tiếp cho [${agentName}]: ${directPrompt}`,
      `Trực tiếp giao việc cho nhân sự ${agentName}: ${directPrompt}`,
    );
  };

  const activeCount = overview?.counts.running ?? (isRunning ? 1 : 0);

  // Helper to get branch status
  const getBranchState = (department: string): "idle" | "running" | "completed" | "failed" => {
    if (!activeOperations?.branches) return "idle";
    const branch = activeOperations.branches.find((b) => b.owner.toLowerCase().includes(department.toLowerCase()));
    if (!branch) return isRunning ? "idle" : "idle";
    if (branch.state === "completed") return "completed";
    if (["running", "in_progress", "pending"].includes(branch.state)) return "running";
    if (branch.state === "failed") return "failed";
    return "idle";
  };

  // Branch owners mapping for executive report
  const branchOwners = new Map(activeOperations?.branches.map(({ id, owner }) => [id, owner]) ?? []);
  const executiveReportData = activeOperations?.report
    ? {
        ...activeOperations.report,
        unavailableBranches: activeOperations.report.unavailableBranches.map((b) => ({
          ...b,
          subtaskId: branchOwners.get(b.subtaskId) ?? b.subtaskId,
        })),
      }
    : undefined;

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
          <Link
            to={activeTaskId ? `/agentic/tasks/${activeTaskId}` : "/agentic/tasks-table"}
            className="ccNavTab"
          >
            Orchestration
          </Link>
          <Link to="/agentic/employees" className="ccNavTab">
            Workforce
          </Link>
        </nav>

        <div className="ccHeaderRight">
          <span className="ccStatBadge">4 Phòng ban</span>
          <span className="ccStatBadge">8 Nhân sự AI</span>
          <span className={`ccStatBadge ${activeCount > 0 ? "activeTasks" : ""}`}>
            {activeCount > 0 && <span className="ccPillDot" />}
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
            placeholder="Hãy giao việc chiến lược cho AI CEO (ví dụ: Rà soát rủi ro kinh doanh đợt này)..."
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
            <span>Lịch sử ({tasks?.items.length ?? 0})</span>
          </button>
          <button
            type="button"
            className="ccQuickPill"
            onClick={() =>
              handleSendStrategicTask(
                "Kiểm toán rủi ro kinh doanh & tồn kho khẩn cấp",
                "Rà soát các SKU có nguy cơ đứt hàng và cảnh báo tồn kho bán chậm.",
              )
            }
          >
            <span>Rà soát sức khỏe cửa hàng</span>
          </button>
          <button
            type="button"
            className="ccQuickPill"
            onClick={() =>
              handleSendStrategicTask(
                "Rà soát đơn hàng quá hạn & khiếu nại khách hàng",
                "Kiểm tra các đơn hàng bị kẹt giao và ticket khách hàng vi phạm thời gian hỗ trợ.",
              )
            }
          >
            <span>Kiểm toán đơn hàng & CSKH</span>
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
              {tasks?.items && tasks.items.length > 0 ? (
                tasks.items.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="ccRecentOutcomeItem"
                    style={{ cursor: "pointer" }}
                    onClick={() => setActiveTaskId(item.id)}
                  >
                    <CheckCircle2 size={16} className="ccCheckIcon" />
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                      <span>
                        <strong>{item.goal}</strong> — Trạng thái: <em>{item.state}</em>
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="ccRecentOutcomeItem">
                  <CheckCircle2 size={16} className="ccCheckIcon" />
                  <span>Chưa có tác vụ nào gần đây. Hãy giao việc ở khung trên!</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Pipeline Flow Bar */}
      <div className="ccPipelineBar">
        <div className="ccPipelineSteps">
          <div className={`ccPipelineNode ${isRunning ? "active" : ""}`}>
            <Bot size={14} />
            <span>AI CEO</span>
          </div>
          <ArrowRight className="ccPipelineArrow" size={14} />
          <div className={`ccPipelineNode ${getBranchState("inventory") === "running" ? "active" : ""}`}>
            <Package size={14} />
            <span>Kỹ sư Tồn kho</span>
          </div>
          <ArrowRight className="ccPipelineArrow" size={14} />
          <div className={`ccPipelineNode ${getBranchState("order") === "running" ? "active" : ""}`}>
            <ShoppingBag size={14} />
            <span>Điều phối Đơn hàng</span>
          </div>
          <ArrowRight className="ccPipelineArrow" size={14} />
          <div className={`ccPipelineNode ${currentWorkflowState === "executive_synthesis" ? "active" : ""}`}>
            <Bot size={14} />
            <span>AI CEO Tổng hợp</span>
          </div>
        </div>

        <div className="ccPipelineStatus">
          {isRunning ? (
            <>
              <div className="ccReasoningIndicator">
                <span className="ccPulseDot" />
                <span>
                  Đang thực thi: {currentWorkflowState}... {Math.floor(elapsedSeconds / 60)}:
                  {String(elapsedSeconds % 60).padStart(2, "0")}
                </span>
              </div>
              <button type="button" className="ccStopButton" onClick={handleStopTask}>
                <Square size={12} fill="currentColor" />
                <span>Dừng</span>
              </button>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#10b981", fontSize: "0.85rem", fontWeight: 600 }}>
              <CheckCircle2 size={15} color="#10b981" />
              <span>
                {activeOperations?.task.state ? `Tác vụ gần nhất: ${activeOperations.task.state}` : "Sẵn sàng nhận việc"}
              </span>
              {activeTaskId && (
                <Link
                  to={`/agentic/tasks/${activeTaskId}`}
                  style={{ color: "#38bdf8", marginLeft: "0.5rem", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                >
                  <span>Chi tiết</span>
                  <ExternalLink size={12} />
                </Link>
              )}
            </div>
          )}
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
            <span className={`ccDeptCountBadge ${getBranchState("catalog") === "running" ? "amber" : "green"}`}>
              {getBranchState("catalog") === "running" ? <span className="ccPillDot" style={{ width: 6, height: 6 }} /> : <Check size={12} />}
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Cây bút Sản phẩm"
            roleTag="SKILL"
            status={getBranchState("catalog") === "running" ? "running" : getBranchState("catalog") === "completed" ? "completed" : "idle"}
            statusText={getBranchState("catalog") === "running" ? "Đang rà soát danh mục sản phẩm và mô tả..." : undefined}
            onSend={(text) => handleAgentDirectTask("Cây bút Sản phẩm", text)}
          />
          <AgentCard
            name="Chuyên viên Merchandising"
            roleTag="TRỢ LÝ"
            status={getBranchState("catalog") === "completed" ? "completed" : "idle"}
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
            <span className={`ccDeptCountBadge ${getBranchState("inventory") === "running" || getBranchState("order") === "running" ? "amber" : "green"}`}>
              {getBranchState("inventory") === "running" ? <span className="ccPillDot" style={{ width: 6, height: 6 }} /> : <Check size={12} />}
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Kỹ sư Tồn kho"
            roleTag="SKILL"
            status={getBranchState("inventory") === "running" ? "running" : getBranchState("inventory") === "completed" ? "completed" : "idle"}
            statusText={getBranchState("inventory") === "running" ? "Đang tính toán lại định mức tồn kho an toàn..." : undefined}
            showProgress={getBranchState("inventory") === "running"}
            onSend={(text) => handleAgentDirectTask("Kỹ sư Tồn kho", text)}
          />
          <AgentCard
            name="Điều phối Đơn hàng"
            roleTag="ĐỘI"
            status={getBranchState("order") === "running" ? "running" : getBranchState("order") === "completed" ? "completed" : "idle"}
            statusText={getBranchState("order") === "running" ? "Đang rà soát đơn hàng quá hạn thanh toán..." : undefined}
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
            <span className={`ccDeptCountBadge ${getBranchState("support") === "running" ? "amber" : "green"}`}>
              {getBranchState("support") === "running" ? <span className="ccPillDot" style={{ width: 6, height: 6 }} /> : <Check size={12} />}
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Quản gia CSKH"
            roleTag="TRỢ LÝ"
            status={getBranchState("support") === "running" ? "running" : getBranchState("support") === "completed" ? "completed" : "idle"}
            statusText={getBranchState("support") === "running" ? "Đang phân tích các ticket khiếu nại khách hàng..." : undefined}
            onSend={(text) => handleAgentDirectTask("Quản gia CSKH", text)}
          />
          <AgentCard
            name="Chuyên viên CRM"
            roleTag="SKILL"
            status={getBranchState("crm") === "completed" ? "completed" : "idle"}
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
            <span className={`ccDeptCountBadge ${getBranchState("finance") === "running" ? "amber" : "green"}`}>
              {getBranchState("finance") === "running" ? <span className="ccPillDot" style={{ width: 6, height: 6 }} /> : <Check size={12} />}
              <span>1 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Kiểm soát viên Tài chính"
            roleTag="SKILL"
            status={getBranchState("finance") === "running" ? "running" : getBranchState("finance") === "completed" ? "completed" : "idle"}
            statusText={getBranchState("finance") === "running" ? "Đang đối soát giao dịch và cổng thanh toán..." : undefined}
            onSend={(text) => handleAgentDirectTask("Kiểm soát viên Tài chính", text)}
          />
        </div>
      </div>

      {/* 5. Live Executive Report Output when available */}
      {executiveReportData && (
        <div style={{ marginTop: "2rem" }}>
          <ExecutiveReport report={executiveReportData} workflowState={currentWorkflowState} />
        </div>
      )}
    </section>
  );
}

interface AgentCardProps {
  readonly name: string;
  readonly roleTag: "SKILL" | "TRỢ LÝ" | "ĐỘI";
  readonly status: "idle" | "running" | "completed" | "failed";
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
        ) : status === "failed" ? (
          <span className="ccStatusIndicatorIcon">
            <AlertTriangle size={15} color="#ef4444" />
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
