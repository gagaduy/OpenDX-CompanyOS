// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from "react";
import {
  RotateCcw,
  Target,
  Play,
  ChevronDown,
  CheckCircle2,
  UploadCloud,
  AlertTriangle,
  Save,
} from "lucide-react";
import type { Edge } from "@xyflow/react";
import type { SupportOperationsApi } from "../../support/api/support-api";
import type { AiSupportProposalView } from "../../support/types/support.types";
import type { MarketingApi } from "../../marketing/api/marketing-api";
import type { MarketingCampaignDetail } from "../../marketing/types";
import type { WorkflowApi } from "../api/workflow-api";
import {
  CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
  MARKETING_LAUNCH_WORKFLOW_FIXTURE,
  ALL_WORKFLOW_DEFINITIONS,
  createLiveWorkflowFromAiProposal,
  createLiveWorkflowFromMarketingCampaign,
  validateWorkflowGraph,
  type BusinessWorkflowDefinition,
  type BusinessWorkflowNode,
  type WorkflowValidationResult,
  type WorkflowEdgeDefinition,
} from "../types";
import { WorkflowCanvas } from "../components/workflow-canvas";
import "../styles/workflows.css";

export interface WorkflowStudioPageProps {
  readonly supportApi?: SupportOperationsApi;
  readonly workflowApi?: WorkflowApi;
  readonly marketingApi?: MarketingApi;
}

function incrementVersion(version: string): string {
  const match = version.match(/v?(\d+)\.(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10) + 1;
    return `v${major}.${minor}`;
  }
  return "v1.1";
}

function applyLiveDataToWorkflow(
  base: BusinessWorkflowDefinition,
  proposal: AiSupportProposalView | null,
  marketingCampaign: MarketingCampaignDetail | null,
): BusinessWorkflowDefinition {
  if (
    base.id === CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id ||
    base.code === CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.code
  ) {
    if (proposal && proposal.tickets.length > 0) {
      return createLiveWorkflowFromAiProposal(proposal, base);
    }
  } else if (
    base.id === MARKETING_LAUNCH_WORKFLOW_FIXTURE.id ||
    base.code === MARKETING_LAUNCH_WORKFLOW_FIXTURE.code
  ) {
    if (marketingCampaign) {
      return createLiveWorkflowFromMarketingCampaign(marketingCampaign, base);
    }
  }
  return base;
}

const LAST_SELECTED_WORKFLOW_KEY = "opendx_workflow_studio_selected_id";

export function WorkflowStudioPage({ supportApi, workflowApi, marketingApi }: WorkflowStudioPageProps = {}) {
  const [workflowsList, setWorkflowsList] = useState<readonly BusinessWorkflowDefinition[]>(ALL_WORKFLOW_DEFINITIONS);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    try {
      if (typeof window !== "undefined" && import.meta.env.MODE !== "test") {
        return (
          window.localStorage.getItem(LAST_SELECTED_WORKFLOW_KEY) ??
          CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id
        );
      }
    } catch {
      // fallback
    }
    return CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id;
  });
  const [activeWorkflow, setActiveWorkflow] = useState<BusinessWorkflowDefinition>(() => {
    try {
      if (typeof window !== "undefined" && import.meta.env.MODE !== "test") {
        const savedId = window.localStorage.getItem(LAST_SELECTED_WORKFLOW_KEY);
        if (savedId) {
          const matched = ALL_WORKFLOW_DEFINITIONS.find((w) => w.id === savedId);
          if (matched) return matched;
        }
      }
    } catch {
      // fallback
    }
    return CUSTOMER_RECOVERY_WORKFLOW_FIXTURE;
  });
  const [currentProposal, setCurrentProposal] = useState<AiSupportProposalView | null>(null);
  const [currentMarketingCampaign, setCurrentMarketingCampaign] = useState<MarketingCampaignDetail | null>(null);
  const [dataSource, setDataSource] = useState<"live" | "fixture">("fixture");
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isDraft, setIsDraft] = useState<boolean>(false);
  const [activeEdges, setActiveEdges] = useState<Edge[]>([]);
  const [publishError, setPublishError] = useState<WorkflowValidationResult | null>(null);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(null);
  const [draftSuccessMsg, setDraftSuccessMsg] = useState<string | null>(null);

  // Switch workflow when user selects a different blueprint
  const handleSelectWorkflow = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_SELECTED_WORKFLOW_KEY, workflowId);
      }
    } catch {
      // ignore
    }
    setIsDraft(false);
    setPublishError(null);
    setPublishSuccessMsg(null);
    setDraftSuccessMsg(null);
    const target =
      workflowsList.find((w) => w.id === workflowId) ??
      ALL_WORKFLOW_DEFINITIONS.find((w) => w.id === workflowId) ??
      CUSTOMER_RECOVERY_WORKFLOW_FIXTURE;
    const hydrated = applyLiveDataToWorkflow(target, currentProposal, currentMarketingCampaign);
    setDataSource(hydrated !== target ? "live" : "fixture");
    setActiveWorkflow(hydrated);
  };

  // Sync blueprints with backend PostgreSQL repository when workflowApi is provided
  useEffect(() => {
    if (!workflowApi) return;
    let isCancelled = false;

    async function loadRemoteBlueprints() {
      try {
        const blueprints = await workflowApi?.listWorkflows();
        if (isCancelled || !blueprints || blueprints.length === 0) return;

        setWorkflowsList((prevList) => {
          return prevList.map((localWf) => {
            const matched = blueprints.find(
              (b) => b.id === localWf.id || b.code === localWf.code
            );
            if (!matched) return localWf;
            return {
              ...localWf,
              ...matched,
              nodes: (matched.nodes && matched.nodes.length > 0)
                ? (matched.nodes as BusinessWorkflowNode[])
                : localWf.nodes,
              edges: (matched.edges && matched.edges.length > 0)
                ? (matched.edges as WorkflowEdgeDefinition[])
                : localWf.edges,
              policyRules: matched.policyRules ?? localWf.policyRules,
            };
          });
        });

        // Update activeWorkflow if remote has published/draft updates
        const activeRemote = blueprints.find(
          (b) => b.id === selectedWorkflowId || b.code === activeWorkflow.code
        );
        if (activeRemote) {
          setActiveWorkflow((prev) => {
            const merged: BusinessWorkflowDefinition = {
              ...prev,
              ...activeRemote,
              nodes: (activeRemote.nodes && activeRemote.nodes.length > 0)
                ? (activeRemote.nodes as BusinessWorkflowNode[])
                : prev.nodes,
              edges: (activeRemote.edges && activeRemote.edges.length > 0)
                ? (activeRemote.edges as WorkflowEdgeDefinition[])
                : prev.edges,
              policyRules: activeRemote.policyRules ?? prev.policyRules,
            };
            return applyLiveDataToWorkflow(merged, currentProposal, currentMarketingCampaign);
          });
        }
      } catch (err) {
        console.warn("Could not load workflow blueprints from backend:", err);
      }
    }

    void loadRemoteBlueprints();
    return () => {
      isCancelled = true;
    };
  }, [workflowApi, selectedWorkflowId, currentProposal, currentMarketingCampaign]);

  useEffect(() => {
    if (!supportApi) return;
    let isCancelled = false;

    async function loadData() {
      try {
        const latest = await supportApi?.getLatestSupportProposal?.();
        if (isCancelled) return;
        if (latest && latest.tickets.length > 0) {
          setCurrentProposal(latest);
          setDataSource("live");
          setActiveWorkflow((prev) => {
            if (selectedWorkflowId === CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id) {
              return createLiveWorkflowFromAiProposal(latest, prev);
            }
            return prev;
          });
          return;
        }

        const ticketsPage = await supportApi?.list({ page: 1, pageSize: 5, status: "new" });
        if (isCancelled) return;
        if (ticketsPage && ticketsPage.items.length > 0) {
          const generated = await supportApi?.generateSupportProposal({
            prompt: "Phân tích phiếu khiếu nại khách hàng và lập phương án bồi thường",
          });
          if (isCancelled) return;
          if (generated && generated.tickets.length > 0) {
            setCurrentProposal(generated);
            setDataSource("live");
            setActiveWorkflow((prev) => {
              if (selectedWorkflowId === CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id) {
                return createLiveWorkflowFromAiProposal(generated, prev);
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.warn("Could not load live support proposal, using fixture:", err);
      }
    }

    void loadData();
    return () => {
      isCancelled = true;
    };
  }, [supportApi, selectedWorkflowId]);

  useEffect(() => {
    if (!marketingApi) return;
    let isCancelled = false;

    async function loadMarketingData() {
      try {
        const campaignsList = await marketingApi?.listCampaigns?.({ limit: 10, offset: 0 });
        if (isCancelled || !campaignsList || campaignsList.items.length === 0) return;

        const targetCamp =
          campaignsList.items.find(
            (c) => c.state === "completed" || c.state === "awaiting_human_approval"
          ) ?? campaignsList.items[0];

        if (!targetCamp) return;

        const detail = await marketingApi?.getCampaign?.(targetCamp.id);
        if (isCancelled || !detail) return;

        setCurrentMarketingCampaign(detail);
        setActiveWorkflow((prev) => {
          if (selectedWorkflowId === MARKETING_LAUNCH_WORKFLOW_FIXTURE.id) {
            setDataSource("live");
            return createLiveWorkflowFromMarketingCampaign(detail, prev);
          }
          return prev;
        });
      } catch (err) {
        console.warn("Could not load marketing campaign for live workflow:", err);
      }
    }

    void loadMarketingData();
    return () => {
      isCancelled = true;
    };
  }, [marketingApi, selectedWorkflowId]);

  const handleApprove = async () => {
    if (selectedWorkflowId === CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id && supportApi && currentProposal && currentProposal.tickets.length > 0) {
      try {
        const firstTicket = currentProposal.tickets[0];
        await supportApi.applySupportProposal(currentProposal.id, [
          {
            ticketId: firstTicket.ticketId,
            responseMessage: firstTicket.proposedResponse,
            resolutionStatus: "resolved",
          },
        ]);
        const updatedProposal: AiSupportProposalView = {
          ...currentProposal,
          status: "applied",
        };
        setCurrentProposal(updatedProposal);
        setActiveWorkflow(createLiveWorkflowFromAiProposal(updatedProposal, activeWorkflow));
      } catch (err) {
        console.error("Live approval error, falling back to local state:", err);
      }
    } else if (selectedWorkflowId === MARKETING_LAUNCH_WORKFLOW_FIXTURE.id && marketingApi && currentMarketingCampaign) {
      try {
        await marketingApi.approveCampaign(currentMarketingCampaign.campaign.id, { decision: "approve" });
        const updatedCamp = await marketingApi.getCampaign(currentMarketingCampaign.campaign.id);
        if (updatedCamp) {
          setCurrentMarketingCampaign(updatedCamp);
          setActiveWorkflow(createLiveWorkflowFromMarketingCampaign(updatedCamp, activeWorkflow));
        }
      } catch (err) {
        console.error("Marketing live approval error:", err);
      }
    } else {
      setActiveWorkflow((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => {
          if (n.type === "approval_gate" || n.type === "action") {
            return { ...n, status: "completed" as const };
          }
          return n;
        }),
      }));
    }
  };

  const handleReset = () => {
    setIsDraft(false);
    setPublishError(null);
    setPublishSuccessMsg(null);
    if (dataSource === "live" && currentProposal && selectedWorkflowId === CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id) {
      const resetProposal: AiSupportProposalView = {
        ...currentProposal,
        status: "pending_approval",
      };
      setCurrentProposal(resetProposal);
      setActiveWorkflow(createLiveWorkflowFromAiProposal(resetProposal, activeWorkflow));
    } else {
      const target =
        workflowsList.find((w) => w.id === selectedWorkflowId) ??
        ALL_WORKFLOW_DEFINITIONS.find((w) => w.id === selectedWorkflowId) ??
        CUSTOMER_RECOVERY_WORKFLOW_FIXTURE;
      setActiveWorkflow(applyLiveDataToWorkflow(target, currentProposal, currentMarketingCampaign));
    }
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
    }, 1500);
  };

  const handleWorkflowEdited = useCallback(() => {
    setIsDraft(true);
    setPublishSuccessMsg(null);
    setDraftSuccessMsg(null);
  }, []);

  const handleSaveDraft = async () => {
    const edgePairs: WorkflowEdgeDefinition[] = activeEdges.map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      label: typeof e.label === "string" ? e.label : undefined,
    }));

    // Extract policy rules from active nodes if applicable
    const thresholdParam = activeWorkflow.nodes
      .find((n) => n.id === "node-3-decision" || n.type === "decision_router")
      ?.details?.parameters?.find((p) => p.label.includes("Hạn mức") || p.label.includes("ngưỡng"));
    let parsedThreshold: number | undefined;
    if (thresholdParam) {
      const digits = thresholdParam.value.replace(/[^\d]/g, "");
      if (digits) {
        parsedThreshold = parseInt(digits, 10);
      }
    }

    const policyRules = {
      ...(activeWorkflow.policyRules ?? {}),
      ...(parsedThreshold !== undefined ? { auto_approval_threshold: parsedThreshold } : {}),
    };

    if (workflowApi) {
      try {
        const saved = await workflowApi.saveDraft(activeWorkflow.id, {
          nodes: activeWorkflow.nodes,
          edges: edgePairs,
          description: activeWorkflow.description,
          targetOutcome: activeWorkflow.targetOutcome,
          policyRules,
        });
        if (saved) {
          const updated: BusinessWorkflowDefinition = {
            ...activeWorkflow,
            ...saved,
            nodes: (saved.nodes && saved.nodes.length > 0)
              ? (saved.nodes as BusinessWorkflowNode[])
              : activeWorkflow.nodes,
            edges: (saved.edges && saved.edges.length > 0)
              ? (saved.edges as WorkflowEdgeDefinition[])
              : edgePairs,
            policyRules: saved.policyRules ?? policyRules,
            status: "draft",
          };
          setActiveWorkflow(updated);
          setWorkflowsList((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        }
        setDraftSuccessMsg(`Đã lưu bản nháp quy trình "${activeWorkflow.name}" vào cơ sở dữ liệu!`);
        setTimeout(() => setDraftSuccessMsg(null), 3000);
      } catch (err) {
        console.error("Failed to save draft to backend:", err);
      }
    } else {
      setDraftSuccessMsg("Đã lưu bản nháp cục bộ thành công!");
      setTimeout(() => setDraftSuccessMsg(null), 3000);
    }
  };

  const handlePublish = async () => {
    const edgePairs: WorkflowEdgeDefinition[] = activeEdges.map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      label: typeof e.label === "string" ? e.label : undefined,
    }));
    const result = validateWorkflowGraph(activeWorkflow.nodes, edgePairs);

    if (!result.isValid) {
      setPublishError(result);
      setPublishSuccessMsg(null);
      return;
    }

    const nextVer = incrementVersion(activeWorkflow.version ?? "v1.0");

    // Extract policy rules from active nodes if applicable
    const thresholdParam = activeWorkflow.nodes
      .find((n) => n.id === "node-3-decision" || n.type === "decision_router")
      ?.details?.parameters?.find((p) => p.label.includes("Hạn mức") || p.label.includes("ngưỡng"));
    let parsedThreshold: number | undefined;
    if (thresholdParam) {
      const digits = thresholdParam.value.replace(/[^\d]/g, "");
      if (digits) {
        parsedThreshold = parseInt(digits, 10);
      }
    }

    const policyRules = {
      ...(activeWorkflow.policyRules ?? {}),
      ...(parsedThreshold !== undefined ? { auto_approval_threshold: parsedThreshold } : {}),
    };

    let updated: BusinessWorkflowDefinition = {
      ...activeWorkflow,
      version: nextVer,
      status: "published",
      publishedAt: new Date().toISOString(),
      policyRules,
      edges: edgePairs,
    };

    if (workflowApi) {
      try {
        const remoteUpdated = await workflowApi.publishWorkflow(activeWorkflow.id, {
          nodes: activeWorkflow.nodes,
          edges: edgePairs,
          version: nextVer,
          policyRules,
        });
        if (remoteUpdated) {
          updated = {
            ...updated,
            ...remoteUpdated,
            nodes: (remoteUpdated.nodes && remoteUpdated.nodes.length > 0)
              ? (remoteUpdated.nodes as BusinessWorkflowNode[])
              : activeWorkflow.nodes,
            edges: (remoteUpdated.edges && remoteUpdated.edges.length > 0)
              ? (remoteUpdated.edges as WorkflowEdgeDefinition[])
              : edgePairs,
          };
        }
      } catch (err) {
        console.error("Failed to publish workflow blueprint to backend:", err);
      }
    }

    setActiveWorkflow(updated);
    setWorkflowsList((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setIsDraft(false);
    setPublishError(null);
    setPublishSuccessMsg(
      `Quy trình "${updated.name}" (${updated.code}) đã được xuất bản và kích hoạt thành công sang phiên bản ${nextVer}!`
    );
  };

  const waitingNode = activeWorkflow.nodes.find((n) => n.status === "waiting_approval");
  const isApproved = activeWorkflow.nodes.some((n) => n.type === "approval_gate" && n.status === "completed");

  return (
    <main className="workflowStudio">
      <header className="workflowHeader">
        <div className="workflowTitleArea">
          {/* Top Switcher & Badges */}
          <div className="workflowSwitcherRow">
            <div className="workflowSelectWrapper">
              <label htmlFor="workflow-selector" className="workflowSelectLabel">Quy trình điều hành:</label>
              <div className="workflowSelectDropdown">
                <select
                  id="workflow-selector"
                  className="workflowSelect"
                  value={selectedWorkflowId}
                  onChange={(e) => handleSelectWorkflow(e.target.value)}
                  aria-label="Chọn quy trình nghiệp vụ"
                >
                  {workflowsList.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.code})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="workflowSelectArrow" aria-hidden="true" />
              </div>
            </div>

            <div className="workflowBadgeGroup">
              <span className="workflowCodeBadge">{activeWorkflow.code}</span>

              {isDraft ? (
                <span className="workflowKpiChip draftBadge" title="Bản nháp đang chỉnh sửa - Chưa xuất bản vào hệ thống">
                  <span className="draftDot" /> Bản nháp ({activeWorkflow.version} - Chưa xuất bản)
                </span>
              ) : (
                <span className="workflowKpiChip publishedBadge" title="Quy trình chuẩn đang vận hành trên toàn doanh nghiệp">
                  <span className="publishedDot" /> Đang hoạt động ({activeWorkflow.version} - Đã xuất bản)
                </span>
              )}

              {dataSource === "live" ? (
                <span className="workflowKpiChip liveDataBadge" title="Đang kết nối dữ liệu thật từ cơ sở dữ liệu">
                  <span className="liveDot" /> Dữ liệu thật từ Hệ Thống
                </span>
              ) : (
                <span className="workflowKpiChip fixtureBadge" title="Đang chạy mô phỏng mẫu">
                  Chế độ mô phỏng
                </span>
              )}
            </div>
          </div>

          <h1 className="workflowHeading">{activeWorkflow.name}</h1>
          <p className="workflowSubtitle">{activeWorkflow.description}</p>

          <div className="workflowTargetOutcome">
            <Target size={14} aria-hidden="true" />
            <span><strong>Mục tiêu:</strong> {activeWorkflow.targetOutcome}</span>
          </div>

          {/* KPI Bar */}
          <div className="workflowKpiBar">
            <span className="workflowKpiChip">
              <strong>{activeWorkflow.nodes.length}</strong> Bước nghiệp vụ
            </span>
            <span className="workflowKpiChip">
              <strong>{activeWorkflow.automationRate}</strong>
            </span>
            {waitingNode && (
              <span className="workflowKpiChip statusWaiting">
                <span className="pulsingDot" aria-hidden="true" /> Đang chờ Sếp duyệt phương án
              </span>
            )}
            {isApproved && (
              <span className="workflowKpiChip statusCompleted">
                <CheckCircle2 size={12} aria-hidden="true" /> Đã phê duyệt & thực thi thành công
              </span>
            )}
          </div>
        </div>

        <div className="workflowControls">
          <button
            type="button"
            className="workflowDraftButton"
            onClick={handleSaveDraft}
            disabled={!isDraft}
            aria-label="Lưu bản nháp quy trình"
            title={isDraft ? "Lưu các thay đổi vào bản nháp" : "Chưa có chỉnh sửa nào để lưu nháp"}
          >
            <Save size={14} aria-hidden="true" />
            Lưu Bản Nháp
          </button>
          <button
            type="button"
            className="workflowPublishButton"
            onClick={handlePublish}
            disabled={!isDraft}
            title={
              isDraft
                ? "Xuất bản và kích hoạt phiên bản mới vào hệ thống vận hành"
                : "Quy trình hiện tại đã là bản mới nhất"
            }
          >
            <UploadCloud size={14} aria-hidden="true" />
            Xuất Bản & Kích Hoạt
          </button>
          <button
            type="button"
            className="workflowSimulateButton"
            onClick={handleRunSimulation}
            disabled={isSimulating}
            aria-label="Chạy thử nghiệm quy trình"
          >
            <Play size={13} aria-hidden="true" />
            {isSimulating ? "Đang chạy thử..." : "Chạy Thử Nghiệm"}
          </button>
          <button
            type="button"
            className="workflowResetButton"
            onClick={handleReset}
            aria-label="Đặt lại quy trình mẫu"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Đặt Lại Thử Nghiệm
          </button>
        </div>
      </header>

      {draftSuccessMsg && (
        <div className="publishAlertBanner publishSuccessBanner" role="status">
          <div className="publishAlertContent">
            <CheckCircle2 size={18} className="publishAlertIcon success" aria-hidden="true" />
            <div>
              <h4 className="publishAlertTitle">Lưu Bản Nháp Thành Công</h4>
              <p className="publishAlertText">{draftSuccessMsg}</p>
            </div>
          </div>
          <button
            type="button"
            className="publishAlertClose"
            onClick={() => setDraftSuccessMsg(null)}
            aria-label="Đóng thông báo lưu nháp"
          >
            ✕
          </button>
        </div>
      )}

      {publishError && (
        <div className="publishAlertBanner publishErrorBanner" role="alert">
          <div className="publishAlertContent">
            <AlertTriangle size={18} className="publishAlertIcon error" aria-hidden="true" />
            <div>
              <h4 className="publishAlertTitle">
                Không thể xuất bản quy trình: Phát hiện {publishError.errors.length} điểm chưa hợp lệ
              </h4>
              <ul className="publishAlertList">
                {publishError.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            className="publishAlertClose"
            onClick={() => setPublishError(null)}
            aria-label="Đóng cảnh báo"
          >
            ✕
          </button>
        </div>
      )}

      {publishSuccessMsg && (
        <div className="publishAlertBanner publishSuccessBanner" role="status">
          <div className="publishAlertContent">
            <CheckCircle2 size={18} className="publishAlertIcon success" aria-hidden="true" />
            <div>
              <h4 className="publishAlertTitle">Xuất Bản & Kích Hoạt Thành Công!</h4>
              <p className="publishAlertText">{publishSuccessMsg}</p>
            </div>
          </div>
          <button
            type="button"
            className="publishAlertClose"
            onClick={() => setPublishSuccessMsg(null)}
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      <WorkflowCanvas
        key={`${activeWorkflow.id}-${dataSource}-${waitingNode ? "waiting" : "ready"}`}
        workflow={activeWorkflow}
        onWorkflowStateChange={setActiveWorkflow}
        onWorkflowEdited={handleWorkflowEdited}
        onEdgesUpdated={setActiveEdges}
        onApprove={handleApprove}
      />
    </main>
  );
}
