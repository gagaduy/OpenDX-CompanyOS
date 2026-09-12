// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef, Fragment } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Send,
  CheckCircle2,
  Clock,
  Square,
  Play,
  Bot,
  Package,
  ShoppingBag,
  Headphones,
  DollarSign,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  Megaphone,
  Palette,
  Share2,
  FileText,
  Download,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Boxes,
  Brain,
  HeartHandshake,
  Zap,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { AgenticTaskOverview, AgenticTaskPage, AgenticTaskOperations } from "../types/agentic.types";
import type {
  MarketingApi,
  SocialTokensSummaryView,
} from "../../marketing/api/marketing-api";
import type { MarketingCampaignDetail, MarketingCampaign } from "../../marketing/types";
import { SocialTokenManagerModal } from "../../marketing/components/social-token-manager-modal";
import type { CatalogApi, MerchandisingProposal, CampaignProposal, ActiveCampaign } from "../../catalog/api/catalog-api";
import { CampaignProposalModal, resolveMediaUrl } from "../../catalog/components/campaign-proposal-modal";
import { ActiveCampaignWidget } from "../../catalog/components/active-campaign-widget";
import type { InventoryApi } from "../../inventory/api/inventory-api";
import { OperationsProposalModal } from "../../inventory/components/operations-proposal-modal";
import type { OperationsProposal, OperationsProposalItem } from "../../inventory/types/inventory.types";
import type { SupportOperationsApi } from "../../support/api/support-api";
import type { AiSupportProposalView } from "../../support/types/support.types";
import { useAuth } from "../../authentication/hooks/auth-context";
import { ExecutiveReport } from "./executive-report";
import type {
  DepartmentQueueMap,
  DepartmentTask,
  DepartmentType,
  ResourceLock,
} from "../types/department-task-queue.types";
import { DIGITAL_EMPLOYEES } from "../types/department-task-queue.types";
import {
  acquireLocks,
  analyzeTaskRequirements,
  checkLockConflicts,
  getInitialAgentForDepartment,
  getNextEligibleTask,
  releaseLocks,
} from "../utils/department-task-scheduler";
import { CommandCenterHeader } from "./command-center/command-center-header";
import { CommandComposerPanel } from "./command-center/command-composer-panel";
import { WorkforceGrid } from "./command-center/workforce-grid";
import { LiveActivityFeed } from "./command-center/live-activity-feed";
import { PendingApprovalsPanel } from "./command-center/pending-approvals-panel";
import { ResultsMetricsPanel } from "./command-center/results-metrics-panel";
import type { DepartmentCardProps, LiveEventItem, PendingApprovalItem, TaskFilterType } from "./command-center/types";
import "../styles/agentic-command-center.css";

export interface ActiveCollaboration {
  fromDept: DepartmentType;
  toDept: DepartmentType;
  label: string;
}

export interface PendingHandoff {
  dept: DepartmentType;
  taskId: string;
  prompt: string;
  waitingForAgent: string;
  waitingForDept: DepartmentType;
  stepName: string;
}

export interface DepartmentAgentStatus {
  activeAgent: string | null;
  agentMessage: string | null;
  completedAgents: string[];
}

interface AgenticCommandCenterProps {
  readonly api: AgenticOperationsApi;
  readonly marketingApi?: MarketingApi;
  readonly catalogApi?: CatalogApi;
  readonly inventoryApi?: InventoryApi;
  readonly supportApi?: SupportOperationsApi;
  readonly overview?: AgenticTaskOverview;
  readonly tasks?: AgenticTaskPage;
  readonly onTaskCreated?: () => void;
  readonly apiBaseUrl?: string;
}

export function AgenticCommandCenter({
  api,
  marketingApi,
  catalogApi,
  inventoryApi,
  supportApi,
  overview,
  tasks,
  onTaskCreated,
  apiBaseUrl,
}: AgenticCommandCenterProps) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"hub" | "orchestration" | "workforce">("hub");
  const [recentOutcomesOpen, setRecentOutcomesOpen] = useState(true);
  const [taskFilter, setTaskFilter] = useState<TaskFilterType>("all");
  const [liveFeedFilter, setLiveFeedFilter] = useState<string>("all");
  const [composerPriority, setComposerPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [composerTarget, setComposerTarget] = useState<string>("ai_ceo");
  const [directInputMode, setDirectInputMode] = useState(false);

  // AI CEO Thinking & Smooth Scroll State
  const [isCeoThinking, setIsCeoThinking] = useState(false);
  const [ceoThinkingText, setCeoThinkingText] = useState("");

  // Smooth scroll to targeted department with pulse animation
  const scrollToDepartment = (columnId: string) => {
    setTimeout(() => {
      const el = document.getElementById(columnId);
      if (el) {
        el.scrollIntoView?.({ behavior: "smooth", block: "center" });
        el.classList.add("ccDeptHighlightGlow");
        setTimeout(() => {
          el.classList.remove("ccDeptHighlightGlow");
        }, 3600);
      }
    }, 180);
  };

  // Active workflow kind: "orchestration" | "marketing" | "merchandising" | "operations" | "support"
  const [activeWorkflowKind, setActiveWorkflowKind] = useState<"orchestration" | "marketing" | "merchandising" | "operations" | "support">("orchestration");

  // Orchestration Task State
  const latestTask = tasks?.items?.[0];
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeOperations, setActiveOperations] = useState<AgenticTaskOperations | null>(null);

  // Marketing Campaign State
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeCampaignDetail, setActiveCampaignDetail] = useState<MarketingCampaignDetail | null>(null);
  const [_campaignsList, setCampaignsList] = useState<readonly MarketingCampaign[]>([]);
  const [marketingActionLoading, setMarketingActionLoading] = useState(false);
  const [revisionInput, setRevisionInput] = useState("");
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  // Social Tokens State & 1-Click Operations
  const [socialTokensSummary, setSocialTokensSummary] = useState<SocialTokensSummaryView | null>(null);
  const [socialTokenModalOpen, setSocialTokenModalOpen] = useState(false);
  const [socialTokenActionLoading, setSocialTokenActionLoading] = useState(false);
  const [socialTokenFeedback, setSocialTokenFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!marketingApi?.getSocialTokensStatus) return;
    const controller = new AbortController();
    marketingApi
      .getSocialTokensStatus(controller.signal)
      .then(setSocialTokensSummary)
      .catch(() => {
        // Silently ignore if unconfigured or error
      });
    return () => controller.abort();
  }, [marketingApi]);

  const handleRefreshSocialAccount = async (platform: "facebook" | "instagram", accountId: string) => {
    if (!marketingApi?.refreshSocialToken) return;
    setSocialTokenActionLoading(true);
    setSocialTokenFeedback(null);
    try {
      const refreshed = await marketingApi.refreshSocialToken({ platform, accountId });
      const successText = `⚡ Đã tự động gia hạn token cho ${platform === "facebook" ? "Facebook Fanpage" : "Instagram"} (${refreshed.accountName || accountId}) thành công! Hạn dùng mới: 60 ngày.`;
      setSocialTokenFeedback(successText);
      setSuccessMessage(successText);
      if (marketingApi.getSocialTokensStatus) {
        const updated = await marketingApi.getSocialTokensStatus();
        setSocialTokensSummary(updated);
      }
    } catch (err: any) {
      const errorText = `Lỗi khi gia hạn token: ${err?.message || "Không xác định"}`;
      setSocialTokenFeedback(errorText);
      setErrorMessage(errorText);
    } finally {
      setSocialTokenActionLoading(false);
    }
  };

  const handleCheckSocialTokens = async () => {
    if (!marketingApi?.checkSocialTokens) return;
    setSocialTokenActionLoading(true);
    setSocialTokenFeedback(null);
    try {
      const checked = await marketingApi.checkSocialTokens();
      setSocialTokensSummary(checked);
      setSocialTokenFeedback("Đã kiểm tra sức khỏe và hạn dùng của tất cả Social Tokens thành công.");
    } catch (err: any) {
      setSocialTokenFeedback(`Lỗi khi kiểm tra token: ${err?.message || "Không xác định"}`);
    } finally {
      setSocialTokenActionLoading(false);
    }
  };

  const [dismissedSocialTokenAlerts, setDismissedSocialTokenAlerts] = useState(false);

  const handleOAuthReconnect = (platform: "facebook" | "instagram") => {
    const metaAppId =
      socialTokensSummary?.metaAppId ||
      (import.meta as any).env?.VITE_META_APP_ID ||
      (typeof window !== "undefined" ? localStorage.getItem("opendx_meta_app_id") : null);

    if (!metaAppId || metaAppId === "123456789") {
      setSocialTokenModalOpen(true);
      setSocialTokenFeedback(
        "Chưa cấu hình Meta App ID. Vui lòng nhấn vào nút '⚙️ Cấu hình Meta App' để nhập Meta App ID & App Secret của bạn.",
      );
      return;
    }

    const redirectUri = `${window.location.origin}/auth/oauth-callback`;
    const popupWidth = 600;
    const popupHeight = 700;
    const left = window.screenX + (window.outerWidth - popupWidth) / 2;
    const top = window.screenY + (window.outerHeight - popupHeight) / 2;

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "META_OAUTH_ERROR") {
        window.removeEventListener("message", handleMessage);
        setSocialTokenFeedback(`Lỗi xác thực Meta: ${event.data.error || "Người dùng đã hủy hoặc từ chối cấp quyền"}`);
        return;
      }
      if (event.data?.type === "META_OAUTH_CODE" && event.data?.code) {
        window.removeEventListener("message", handleMessage);
        if (marketingApi?.exchangeSocialOAuthCode) {
          setSocialTokenActionLoading(true);
          setSocialTokenFeedback("Đang trao đổi mã ủy quyền với Meta để cấp Page Access Token vĩnh viễn...");
          try {
            const storedAppId =
              socialTokensSummary?.metaAppId ||
              (typeof window !== "undefined" ? localStorage.getItem("opendx_meta_app_id") : null);
            const storedAppSecret =
              typeof window !== "undefined" ? localStorage.getItem("opendx_meta_app_secret") : null;
            const updated = await marketingApi.exchangeSocialOAuthCode({
              code: event.data.code,
              redirectUri,
              platform,
              targetPageId: "1321445584378490",
              appId: storedAppId || undefined,
              appSecret: storedAppSecret || undefined,
            });
            setSocialTokensSummary(updated);
            const okMsg = "Đã kết nối lại và cấp Page Access Token vĩnh viễn thành công! Hệ thống đã sẵn sàng đăng bài.";
            setSocialTokenFeedback(okMsg);
            setSuccessMessage(okMsg);
          } catch (err: any) {
            const errMsg = `Lỗi khi đổi OAuth code: ${err?.message || "Không xác định"}`;
            setSocialTokenFeedback(errMsg);
            setErrorMessage(errMsg);
          } finally {
            setSocialTokenActionLoading(false);
          }
        }
      }
    };
    window.addEventListener("message", handleMessage);

    const oauthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${encodeURIComponent(
      metaAppId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish&response_type=code`;
    window.open(oauthUrl, "MetaOAuth", `width=${popupWidth},height=${popupHeight},left=${left},top=${top}`);
  };

  const handleConfigureMetaApp = async (appId: string, appSecret: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("opendx_meta_app_id", appId.trim());
      localStorage.setItem("opendx_meta_app_secret", appSecret.trim());
    }
    if (!marketingApi?.configureMetaApp) return;
    setSocialTokenActionLoading(true);
    setSocialTokenFeedback(null);
    try {
      const updated = await marketingApi.configureMetaApp({ appId, appSecret });
      setSocialTokensSummary(updated);
      setSocialTokenFeedback("Đã lưu cấu hình Meta App ID và App Secret thành công! Bạn có thể ấn '1-Click Kết nối lại' ngay bây giờ.");
    } catch (err: any) {
      setSocialTokenFeedback(`Lỗi lưu cấu hình Meta App: ${err?.message || "Không xác định"}`);
    } finally {
      setSocialTokenActionLoading(false);
    }
  };

  const handleUpdateSocialToken = async (platform: "facebook" | "instagram", token: string, accountId?: string) => {
    if (!marketingApi?.updateSocialToken) return;
    setSocialTokenActionLoading(true);
    setSocialTokenFeedback(null);
    try {
      await marketingApi.updateSocialToken({ platform, accessToken: token, accountId });
      setSocialTokenFeedback(
        `Đã cập nhật và xác thực token cho ${platform === "facebook" ? "Facebook Fanpage" : "Instagram"} thành công!`,
      );
      if (marketingApi.getSocialTokensStatus) {
        const updated = await marketingApi.getSocialTokensStatus();
        setSocialTokensSummary(updated);
      }
    } catch (err: any) {
      setSocialTokenFeedback(`Lỗi khi cập nhật token: ${err?.message || "Không xác định"}`);
    } finally {
      setSocialTokenActionLoading(false);
    }
  };

  const handleSyncSocialTokensEnv = async () => {
    if (!marketingApi?.syncSocialTokensFromEnv) return;
    setSocialTokenActionLoading(true);
    setSocialTokenFeedback(null);
    try {
      const summary = await marketingApi.syncSocialTokensFromEnv();
      setSocialTokensSummary(summary);
      setSocialTokenFeedback("Đã đồng bộ và kiểm tra lại toàn bộ Social Tokens từ file .env thành công!");
    } catch (err: any) {
      setSocialTokenFeedback(`Lỗi khi đồng bộ từ .env: ${err?.message || "Không xác định"}`);
    } finally {
      setSocialTokenActionLoading(false);
    }
  };

  // Merchandising / Catalog & Pricing State
  const [merchandisingProposal, setMerchandisingProposal] = useState<MerchandisingProposal | null>(null);
  const [merchandisingLoading, setMerchandisingLoading] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null);
  const [campaignProposal, setCampaignProposal] = useState<CampaignProposal | null>(null);
  const [campaignProposalModalOpen, setCampaignProposalModalOpen] = useState(false);
  const [isActivatingCampaign, setIsActivatingCampaign] = useState(false);
  const [isRevertingCampaign, setIsRevertingCampaign] = useState(false);

  useEffect(() => {
    if (catalogApi) {
      void catalogApi.getActiveCampaign().then(setActiveCampaign).catch(console.error);
    }
  }, [catalogApi]);

  // Operations / Inventory Restock State
  const [operationsProposal, setOperationsProposal] = useState<OperationsProposal | null>(null);
  const [pendingReplenishment, setPendingReplenishment] = useState<OperationsProposal | null>(null);
  const [isOperationsModalOpen, setIsOperationsModalOpen] = useState(false);
  const [operationsActionLoading, setOperationsActionLoading] = useState(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [operationsPage, setOperationsPage] = useState(1);

  useEffect(() => {
    if (!inventoryApi) return;
    let isCancelled = false;
    const fetchPending = async () => {
      try {
        const prop = await inventoryApi.getPendingReplenishment();
        if (!isCancelled) setPendingReplenishment(prop);
      } catch (err) {
        console.error("Failed to fetch pending replenishment:", err);
      }
    };
    void fetchPending();
    const timer = setInterval(fetchPending, 30_000);
    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [inventoryApi]);

  const handleDismissReplenishment = async () => {
    if (!pendingReplenishment?.id || !inventoryApi) return;
    try {
      await inventoryApi.dismissReplenishmentProposal(pendingReplenishment.id);
      setPendingReplenishment(null);
    } catch (err) {
      console.error("Failed to dismiss replenishment:", err);
    }
  };

  // Customer Support & CRM State
  const [supportProposal, setSupportProposal] = useState<AiSupportProposalView | null>(null);
  const [supportActionLoading, setSupportActionLoading] = useState(false);
  const [isDownloadingSupportDocx, setIsDownloadingSupportDocx] = useState(false);
  const [supportTicketsPage, setSupportTicketsPage] = useState(1);
  const [supportVipPage, setSupportVipPage] = useState(1);

  // Department Task Queues & Resource Locks State
  const [departmentQueues, setDepartmentQueues] = useState<DepartmentQueueMap>({
    marketing: [],
    merchandising: [],
    operations: [],
    support: [],
  });
  const [activeLocks, setActiveLocks] = useState<Record<string, ResourceLock>>({});

  const departmentQueuesRef = useRef(departmentQueues);
  departmentQueuesRef.current = departmentQueues;

  const activeLocksRef = useRef(activeLocks);
  activeLocksRef.current = activeLocks;

  // Mid-Pipeline Cross-Department Handoff Waiting State
  const [pendingHandoff, setPendingHandoff] = useState<PendingHandoff | null>(null);
  const handoffWaitersRef = useRef<
    Map<string, { taskId: string; resolve: () => void; reject: (err: Error) => void }[]>
  >(new Map());

  const waitForResource = (agentId: string, taskId: string): Promise<void> => {
    if (!activeLocksRef.current[agentId]) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const current = handoffWaitersRef.current.get(agentId) || [];
      current.push({ taskId, resolve, reject });
      handoffWaitersRef.current.set(agentId, current);
    });
  };

  const notifyResourceWaiters = (releasedAgents: string[]) => {
    for (const ag of releasedAgents) {
      const waiters = handoffWaitersRef.current.get(ag);
      if (waiters && waiters.length > 0) {
        const next = waiters.shift();
        next?.resolve();
      }
    }
  };

  const getAgentWaitingTasksCount = (agentId: string): number => {
    let count = 0;
    const depts: DepartmentType[] = ["marketing", "merchandising", "operations", "support"];
    for (const d of depts) {
      for (const t of departmentQueues[d]) {
        if (t.status === "queued" && t.waitingForResource?.agentId === agentId) {
          count++;
        }
      }
    }
    if (pendingHandoff?.waitingForAgent === agentId) {
      count++;
    }
    return count;
  };

  const handleCancelQueuedTask = (taskId: string, dept: DepartmentType) => {
    setDepartmentQueues((prev) => ({
      ...prev,
      [dept]: prev[dept].filter((t) => t.id !== taskId),
    }));
    setSuccessMessage("Đã hủy nhiệm vụ khỏi hàng chờ.");
  };

  const handleCancelPendingHandoff = (dept: DepartmentType) => {
    if (pendingHandoff && pendingHandoff.dept === dept) {
      const waiters = handoffWaitersRef.current.get(pendingHandoff.waitingForAgent);
      if (waiters) {
        const remaining = waiters.filter((w) => {
          if (w.taskId === pendingHandoff.taskId) {
            w.reject(new Error("Handoff cancelled by user"));
            return false;
          }
          return true;
        });
        handoffWaitersRef.current.set(pendingHandoff.waitingForAgent, remaining);
      }
      setPendingHandoff(null);
      setDeptStatus((prev) => ({
        ...prev,
        [dept]: { activeAgent: null, agentMessage: null, completedAgents: [] },
      }));
      setActiveLocks((prev) => releaseLocks(["catalog_copywriter", "pricing_strategist"], prev));
      setSuccessMessage("Đã hủy bàn giao nhiệm vụ.");
    }
  };

  // Stepped Visual Progression & CEO Planning
  const [ceoPlan, setCeoPlan] = useState<{
    goal: string;
    targetDept: string;
    steps: { role: string; task: string; status: "pending" | "running" | "done" }[];
  } | null>(null);
  const [marketingActiveAgent, setMarketingActiveAgent] = useState<string | null>(null);
  const [marketingAgentMessage, setMarketingAgentMessage] = useState<string | null>(null);

  // Active Cross-Department Collaboration Bridge ("Sợi dây kết nối")
  const [activeCollaboration, setActiveCollaboration] = useState<ActiveCollaboration | null>(null);
  const departmentsGridRef = useRef<HTMLDivElement | null>(null);

  // Department-level Sequential Execution State Machine
  const [deptStatus, setDeptStatus] = useState<Record<DepartmentType, DepartmentAgentStatus>>({
    marketing: { activeAgent: null, agentMessage: null, completedAgents: [] },
    merchandising: { activeAgent: null, agentMessage: null, completedAgents: [] },
    operations: { activeAgent: null, agentMessage: null, completedAgents: [] },
    support: { activeAgent: null, agentMessage: null, completedAgents: [] },
  });

  const setDeptActiveAgent = (
    dept: DepartmentType,
    agentId: string | null,
    message: string | null = null,
    previousDoneAgentId?: string,
  ) => {
    setDeptStatus((prev) => {
      const current = prev[dept];
      const newCompleted = previousDoneAgentId
        ? Array.from(new Set([...current.completedAgents, previousDoneAgentId]))
        : current.completedAgents;
      return {
        ...prev,
        [dept]: {
          activeAgent: agentId,
          agentMessage: message,
          completedAgents: newCompleted,
        },
      };
    });
  };

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [visualBlobUrl, setVisualBlobUrl] = useState<string | null>(null);

  // Load initial marketing campaigns list for History without forcing auto-open on clean mount
  useEffect(() => {
    if (!marketingApi?.listCampaigns) return;
    let isMounted = true;

    marketingApi
      .listCampaigns({ limit: 5 })
      .then((res) => {
        if (isMounted) {
          setCampaignsList(res.items);
        }
      })
      .catch((err) => console.error("Failed to load marketing campaigns:", err));

    return () => {
      isMounted = false;
    };
  }, [marketingApi]);

  // Authenticated visual blob loader for image preview
  useEffect(() => {
    if (!activeCampaignDetail || !marketingApi) {
      setVisualBlobUrl(null);
      return;
    }

    let isMounted = true;
    const loadVisual = async () => {
      let pngArtifact = activeCampaignDetail.artifacts?.find(
        (art) => art.mediaType === "image/png" || art.filename.endsWith(".png"),
      );

      if (!pngArtifact && activeCampaignDetail.visualAssets && activeCampaignDetail.visualAssets.length > 0) {
        try {
          const res = await marketingApi.generateDeliverables(activeCampaignDetail.campaign.id);
          pngArtifact = res.items.find(
            (art) => art.mediaType === "image/png" || art.filename.endsWith(".png"),
          );
        } catch {
          // Ignore
        }
      }

      if (pngArtifact && marketingApi.fetchArtifactBlob) {
        try {
          const blob = await marketingApi.fetchArtifactBlob(pngArtifact.id);
          if (isMounted) {
            const url = URL.createObjectURL(blob);
            setVisualBlobUrl(url);
          }
        } catch (err) {
          console.error("Failed to fetch image blob:", err);
        }
      }
    };

    loadVisual();

    return () => {
      isMounted = false;
    };
  }, [activeCampaignDetail, marketingApi]);

  // Poll Orchestration operations when an orchestration task is active
  useEffect(() => {
    if (!activeTaskId || activeWorkflowKind === "marketing") return;

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
    const interval = setInterval(fetchOps, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeTaskId, activeWorkflowKind, api]);

  // Poll Marketing campaign detail when a marketing campaign is active
  useEffect(() => {
    if (!activeCampaignId || !marketingApi) return;

    let isMounted = true;
    const fetchCampaign = async () => {
      try {
        const detail = await marketingApi.getCampaign(activeCampaignId);
        if (isMounted) {
          setActiveCampaignDetail(detail);
        }
      } catch (err) {
        console.error("Failed to load marketing campaign detail:", err);
      }
    };

    fetchCampaign();
    const interval = setInterval(fetchCampaign, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeCampaignId, marketingApi]);

  // Determine running state
  const currentOrchestrationState =
    activeOperations?.workflow?.state ?? activeOperations?.task.state ?? latestTask?.state ?? "idle";
  const isOrchestrationRunning = [
    "planning",
    "awaiting_plan_approval",
    "dispatching",
    "department_analysis",
    "quality_review",
    "collaboration",
    "executive_synthesis",
    "retrying",
  ].includes(currentOrchestrationState);

  const currentMarketingState = activeCampaignDetail?.campaign.state ?? "idle";
  const isMarketingRunning = [
    "validating",
    "content_drafting",
    "visual_creation",
    "campaign_review",
    "scheduled",
    "publishing",
    "verifying_publication",
    "reporting",
  ].includes(currentMarketingState);

  const isRunning = activeWorkflowKind === "marketing" ? isMarketingRunning : isOrchestrationRunning;

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Helper: Intent classifier for AI CEO
  const detectStrategicIntent = (text: string): "marketing" | "merchandising" | "operations" | "support" | "orchestration" => {
    const lower = text.toLowerCase();

    // 0. Explicit Department Direct Prefix Check (from direct department inputs)
    if (lower.includes("[phòng danh mục") || lower.includes("[phòng catalog") || lower.includes("[phòng thương mại")) {
      return "merchandising";
    }
    if (lower.includes("[phòng tiếp thị") || lower.includes("[phòng marketing")) {
      return "marketing";
    }
    if (lower.includes("[phòng vận hành") || lower.includes("[phòng kho")) {
      return "operations";
    }
    if (lower.includes("[phòng cskh") || lower.includes("[phòng chăm sóc")) {
      return "support";
    }

    // 1. Merchandising / Catalog & Pricing keywords (Prioritize pricing, discounts, promotions)
    const merchandisingKeywords = [
      "phòng thương mại",
      "phòng catalog",
      "định giá",
      "flash sale",
      "giảm giá",
      "khuyến mãi",
      "chiết khấu",
      "ưu đãi",
      "tối ưu sản phẩm",
      "mô tả sản phẩm",
      "chuẩn seo",
      "tiêu đề sản phẩm",
      "danh mục",
      "pricing",
      "catalog",
      "merchandising",
      "bảng giá",
      "hạ giá",
    ];

    const isExplicitSocialPublishing =
      lower.includes("đăng bài") ||
      lower.includes("lên facebook") ||
      lower.includes("lên instagram") ||
      lower.includes("lên fanpage") ||
      lower.includes("fanpage") ||
      lower.includes("mạng xã hội") ||
      lower.includes("viết bài") ||
      lower.includes("poster");

    if (!isExplicitSocialPublishing && (
      merchandisingKeywords.some((kw) => lower.includes(kw)) ||
      (/\b(?:giảm|sale)\s*\d+\s*%/i.test(lower)) ||
      (/\b\d+\s*%\b/.test(lower) && (lower.includes("laptop") || lower.includes("phone") || lower.includes("sản phẩm") || lower.includes("chuột") || lower.includes("bàn phím") || lower.includes("toàn bộ")))
    )) {
      return "merchandising";
    }

    // 2. Marketing & Media keywords (without ambiguous 'chiến dịch')
    const marketingKeywords = [
      "phòng marketing",
      "marketing",
      "tiếp thị",
      "quảng bá",
      "quảng cáo",
      "truyền thông",
      "bài viết",
      "đăng bài",
      "facebook",
      "instagram",
      "fanpage",
      "poster",
      "mạng xã hội",
      "content",
      "visual",
      "bộ sưu tập",
      "bst",
      "hashtag",
      "social",
    ];
    if (marketingKeywords.some((kw) => lower.includes(kw))) {
      return "marketing";
    }

    // 3. Explicit Department Priority Check: Operations & Inventory
    const operationsKeywords = [
      "phòng vận hành",
      "phòng kho",
      "tồn kho",
      "nhập kho",
      "kiểm kho",
      "rà soát kho",
      "bổ sung kho",
      "hết hàng",
      "thiếu hàng",
      "safety stock",
      "restock",
      "inventory",
      "chuỗi cung ứng",
      "logistics",
      "ngân sách nhập",
      "nhập thêm",
    ];
    if (operationsKeywords.some((kw) => lower.includes(kw))) {
      return "operations";
    }

    // 4. Customer Support & CRM keywords (Specific phrases only)
    const supportKeywords = [
      "cskh",
      "chăm sóc khách hàng",
      "khiếu nại",
      "ticket",
      "phản hồi ticket",
      "hỗ trợ khách hàng",
      "đổi trả",
      "bảo hành",
      "tư vấn viên",
      "sự cố kỹ thuật",
      "csat",
      "churn",
    ];
    if (supportKeywords.some((kw) => lower.includes(kw))) {
      return "support";
    }

    return "orchestration";
  };

  // Strategic AI CEO Dispatch
  const handleSendStrategicTask = async (customGoal?: string, customInstructions?: string) => {
    const goalText = (customGoal || prompt).trim();
    if (!goalText || isSubmitting) return;

    let strategicAgents: string[] = [];
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setElapsedSeconds(0);

      // 🧠 Phase 1: AI CEO Thinking & Department Routing Simulation (1.2s - 1.5s)
      setIsCeoThinking(true);
      setCeoThinkingText("👑 AI CEO đang phân tích yêu cầu, đánh giá mục tiêu & lựa chọn phòng ban phù hợp...");
      await new Promise((r) => setTimeout(r, 1300));
      setIsCeoThinking(false);

      const intent = detectStrategicIntent(goalText);
      const strategicTaskId = crypto.randomUUID();
      strategicAgents =
        intent === "support"
          ? ["support_steward", "crm_specialist"]
          : intent === "operations"
          ? ["inventory_specialist", "order_coordinator"]
          : intent === "merchandising"
          ? ["catalog_copywriter", "pricing_strategist", "marketing_visual"]
          : intent === "marketing"
          ? ["marketing_copywriter", "marketing_visual", "marketing_publisher"]
          : ["inventory_specialist", "support_steward"];

      setActiveLocks((prev) =>
        acquireLocks(
          strategicTaskId,
          (intent === "orchestration" ? "operations" : intent) as DepartmentType,
          strategicAgents,
          goalText,
          prev,
        ),
      );

      if (intent === "support" && supportApi) {
        scrollToDepartment("dept-column-support");
        // Route to Customer Support & CRM Department
        setActiveWorkflowKind("support");

        const cleanName =
          goalText.length > 70
            ? `${goalText.slice(0, 68)}...`
            : goalText.replace(
                /^(chỉ thị|chỉ đạo|nghị quyết|lệnh điều hành|hãy|yêu cầu|triển khai|rà soát|kiểm tra|chăm sóc)(?:\s+(?:từ\s+)?(?:tổng\s+giám\s+đốc|ceo|ban\s+giám\s+đốc|hội\s+đồng\s+quản\s+trị))?[:\s-]*/i,
                "",
              );

        setCeoPlan({
          goal: goalText,
          targetDept: "Phòng CSKH & Trải nghiệm Khách hàng",
          steps: [
            {
              role: "Quản gia CSKH (Support Steward)",
              task: `Rà soát ticket sự cố, phân loại mức độ nghiêm trọng & đánh giá tâm lý CSAT cho: "${cleanName}"`,
              status: "running",
            },
            {
              role: "Chuyên viên CRM (CRM Specialist)",
              task: `Phân khúc khách hàng VIP, đánh giá Churn Risk & lập Báo cáo Kiểm toán Word (.docx)`,
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: `Phê duyệt kịch bản phản hồi, cấp voucher đền bù & Tải Báo cáo Kiểm toán Word (.docx)`,
              status: "pending",
            },
          ],
        });

        // Stage 1: Quản gia CSKH rà soát ticket & tâm lý
        setMarketingActiveAgent("support_steward");
        setMarketingAgentMessage("🔍 Quản gia CSKH đang rà soát dữ liệu ticket sự cố và đánh giá tâm lý khách hàng...");
        await new Promise((r) => setTimeout(r, 1200));

        // Transition: Step 1 done -> Step 2 running
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 0
                    ? { ...s, status: "done" }
                    : idx === 1
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        // Stage 2: Chuyên viên CRM phân tích dữ liệu khách hàng
        setMarketingActiveAgent("crm_specialist");
        setMarketingAgentMessage("🎯 Chuyên viên CRM đang phân tích hành vi khách hàng, phân khúc VIP, Churn Risk & soạn Báo cáo CSKH...");

        const proposal = await supportApi.generateSupportProposal(goalText);
        setSupportProposal(proposal);
        setSupportTicketsPage(1);
        setSupportVipPage(1);

        // Transition: Step 1 & 2 done -> Step 3 waiting approval
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 0 || idx === 1
                    ? { ...s, status: "done" }
                    : idx === 2
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setSuccessMessage("AI CEO & Đội ngũ CSKH đã hoàn tất rà soát và lập Báo cáo Word (.docx)! Sẵn sàng để bạn duyệt gửi phản hồi.");
        setIsSubmitting(false);
        return;
      }

      if (intent === "operations" && inventoryApi) {
        scrollToDepartment("dept-column-operations");
        // Route to Operations & Inventory Department
        setActiveWorkflowKind("operations");

        const cleanName =
          goalText.length > 70
            ? `${goalText.slice(0, 68)}...`
            : goalText.replace(
                /^(chỉ thị|chỉ đạo|nghị quyết|lệnh điều hành|hãy|yêu cầu|triển khai|rà soát|kiểm tra|nhập thêm)(?:\s+(?:từ\s+)?(?:tổng\s+giám\s+đốc|ceo|ban\s+giám\s+đốc|hội\s+đồng\s+quản\s+trị))?[:\s-]*/i,
                "",
              );

        setCeoPlan({
          goal: goalText,
          targetDept: "Phòng Vận hành & Kho vận",
          steps: [
            {
              role: "Kỹ sư Tồn kho (Inventory Specialist)",
              task: `Rà soát mức tồn kho thực tế, đối soát lượng giữ chỗ & đánh giá rủi ro đứt gãy cho: "${cleanName}"`,
              status: "running",
            },
            {
              role: "Điều phối Đơn hàng (Order Coordinator)",
              task: `Tính toán tốc độ luân chuyển, dự toán ngân sách & lập Báo cáo Kiểm toán Word (.docx)`,
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: `Phê duyệt kế hoạch nhập kho & Tải Báo cáo Kiểm toán Word (.docx)`,
              status: "pending",
            },
          ],
        });

        // Stage 1: Kỹ sư Tồn kho rà soát
        setMarketingActiveAgent("inventory_specialist");
        setMarketingAgentMessage("🔍 Kỹ sư Tồn kho đang rà soát dữ liệu tồn kho thực tế & đối soát lượng giữ chỗ trong database...");
        await new Promise((r) => setTimeout(r, 1200));

        // Transition: Step 1 done -> Step 2 running
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 0
                    ? { ...s, status: "done" }
                    : idx === 1
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        // Stage 2: Điều phối Đơn hàng rà soát định mức tồn kho
        setMarketingActiveAgent("order_coordinator");
        setMarketingAgentMessage("📦 Điều phối Đơn hàng đang rà soát dữ liệu tồn kho, tính toán định mức an toàn & lập Báo cáo Kho vận...");

        const proposal = await inventoryApi.generateOperationsProposal(goalText);
        setOperationsProposal(proposal);
        setIsOperationsModalOpen(true);
        setOperationsPage(1);

        // Transition: Step 1 & 2 done -> Step 3 waiting approval
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 0 || idx === 1
                    ? { ...s, status: "done" }
                    : idx === 2
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setSuccessMessage("AI CEO & Kỹ sư Kho đã hoàn tất kiểm toán và lập Báo cáo Word (.docx)! Sẵn sàng để bạn tải về và phê duyệt.");
        setIsSubmitting(false);
        return;
      }

      if (intent === "merchandising" && catalogApi) {
        scrollToDepartment("dept-column-merchandising");
        // Route to Catalog & Merchandising Department
        setActiveWorkflowKind("merchandising");

        const cleanName =
          goalText.length > 70
            ? `${goalText.slice(0, 68)}...`
            : goalText.replace(
                /^(chỉ thị|chỉ đạo|nghị quyết|lệnh điều hành|hãy|yêu cầu|triển khai|tối ưu|giảm giá)(?:\s+(?:từ\s+)?(?:tổng\s+giám\s+đốc|ceo|ban\s+giám\s+đốc|hội\s+đồng\s+quản\s+trị))?[:\s-]*/i,
                "",
              );

        setCeoPlan({
          goal: goalText,
          targetDept: "Phòng Danh mục & Định giá (Phối hợp Tiếp thị)",
          steps: [
            {
              role: "Cây bút Sản phẩm (Phòng Danh mục)",
              task: `Tối ưu tên sản phẩm chuẩn SEO, viết lại mô tả tính năng nổi bật & nhãn ưu đãi cho: "${cleanName}"`,
              status: "running",
            },
            {
              role: "Thiết kế Đồ họa (Phòng Tiếp thị - Phối hợp)",
              task: `Phối hợp liên phòng: Thiết kế poster, dựng banner và huy hiệu 3D cho các sản phẩm chiến dịch`,
              status: "pending",
            },
            {
              role: "Chuyên gia Định giá (Phòng Định giá)",
              task: `Phân tích biên lợi nhuận, tính toán mức giảm giá Flash Sale và dự báo lượng bán`,
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: `Xem trước trực quan, phê duyệt & kích hoạt chiến dịch lên Storefront`,
              status: "pending",
            },
          ],
        });

        // Stage 1: Cây bút Sản phẩm (Catalog Copywriter) tối ưu SEO & mô tả
        setMarketingActiveAgent("catalog_copywriter");
        setMarketingAgentMessage("✍️ Cây bút Sản phẩm đang nghiên cứu danh mục, tối ưu tiêu đề chuẩn SEO & viết mô tả ưu đãi...");
        await new Promise((r) => setTimeout(r, 1200));

        // Transition: Cây bút Sản phẩm done -> Thiết kế Đồ họa (Phòng Tiếp thị) running
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 0
                    ? { ...s, status: "done" }
                    : idx === 1
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        // Stage 2: Chiều đi (Bàn giao: Danh mục -> Tiếp thị)
        setActiveCollaboration({
          fromDept: "merchandising",
          toDept: "marketing",
          label: "⚡ Bàn giao: Yêu cầu Thiết kế Poster & Banner 3D",
        });
        setDeptActiveAgent("merchandising", null, "Đang phối hợp cùng Thiết kế Đồ họa bên Tiếp thị...", "catalog_copywriter");
        setDeptActiveAgent("marketing", "marketing_visual", "Phối hợp cùng Danh mục: Đang vẽ poster ưu đãi & badge 3D...");
        setMarketingActiveAgent("merchandising_visual_collab");
        setMarketingAgentMessage("🎨 [Phối hợp cùng Danh mục] Thiết kế Đồ họa đang vẽ poster quảng bá, thiết kế banner và huy hiệu 3D chiến dịch...");

        let cProposal: any = null;
        try {
          const cleanPromptForApi = goalText.replace(/^\[phòng[^\]]+\]\s*/i, "");
          cProposal = await catalogApi.generateCampaignProposal({ prompt: cleanPromptForApi });
        } catch {
          cProposal = null;
        }

        // Stage 2 hoàn tất -> Chiều về (Bàn giao lại: Tiếp thị -> Danh mục)
        setDeptActiveAgent("marketing", null, "Đã hoàn thành thiết kế, đang bàn giao lại kết quả...", "marketing_visual");
        setActiveCollaboration({
          fromDept: "marketing",
          toDept: "merchandising",
          label: "⚡ Bàn giao lại: Hoàn tất Poster & Banner ➔ Danh mục",
        });
        await new Promise((r) => setTimeout(r, 1000));
        setActiveCollaboration(null);
        setDeptActiveAgent("marketing", null, null, "marketing_visual");

        // Transition: Thiết kế Đồ họa done -> Chuyên gia Định giá running
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 0 || idx === 1
                    ? { ...s, status: "done" }
                    : idx === 2
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        // Stage 3: Chuyên gia Định giá tính toán giá Flash Sale & biên lợi nhuận
        setMarketingActiveAgent("pricing_strategist");
        setMarketingAgentMessage("📊 Chuyên gia Định giá đang phân tích biên lợi nhuận, chiết khấu và thiết lập bảng giá Flash Sale...");
        await new Promise((r) => setTimeout(r, 1200));

        if (cProposal) {
          setCampaignProposal(cProposal);
          setCampaignProposalModalOpen(true);
          setMerchandisingProposal({
            id: cProposal.id,
            prompt: cProposal.prompt,
            items: cProposal.items.map((it: any) => ({
              targetProductId: it.productId,
              targetVariantId: it.variantId,
              productName: it.productName,
              productSlug: it.productSlug,
              categoryName: "Danh mục",
              optimizedTitle: it.optimizedTitle,
              optimizedDescription: it.optimizedDescription,
              badge: it.badge,
              originalPriceVnd: it.originalPriceVnd,
              proposedPriceVnd: it.campaignPriceVnd,
              discountPercent: it.discountPercent,
              savingAmountVnd: it.savingAmountVnd,
              originalMediaUrl: it.originalMediaUrl,
              campaignMediaUrl: it.campaignMediaUrl,
            })),
            originalMediaUrl: cProposal.items[0]?.originalMediaUrl,
            campaignMediaUrl: cProposal.items[0]?.campaignMediaUrl,
            pricingRationale: cProposal.pricingRationale,
            salesProjection: cProposal.salesProjection,
            status: "pending_approval",
            createdAt: cProposal.startTime,
          });
        } else {
          try {
            const proposal = await catalogApi.generateMerchandisingProposal({ prompt: goalText });
            setMerchandisingProposal(proposal);
          } catch {
            // fallback
          }
        }

        // Transition: Step 3 done -> Step 4 waiting approval
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx <= 2
                    ? { ...s, status: "done" }
                    : idx === 3
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setSuccessMessage("AI CEO và các phòng ban đã hoàn tất phối hợp! Sẵn sàng để bạn xem trước và duyệt chiến dịch.");
        setIsSubmitting(false);
        return;
      }

      if (intent === "marketing" && marketingApi) {
        scrollToDepartment("dept-column-marketing");
        // Route to Marketing Department
        setActiveWorkflowKind("marketing");

        // Format brief details dynamically from prompt
        const scheduledTime = new Date(Date.now() + 3600 * 1000).toISOString();
        const deadlineTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const idempotencyKey = crypto.randomUUID();

        // Dynamically deduce subject reference and kind
        const normalizeSlug = (str: string) =>
          str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[đĐ]/g, "d")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 50);

        const subjectMatch = goalText.match(/(?:sản phẩm|mặt hàng|thiết bị|điện thoại|laptop|tai nghe|đồng hồ|chiến dịch)\s+([a-zA-Z0-9\s\-_À-ỹ]+?)(?=\s+(?:trên|kèm|với|giảm|ưu đãi|tại|hôm nay|$|\.))/i);
        const dynamicSubjectRef = subjectMatch?.[1]?.trim()
          ? normalizeSlug(subjectMatch[1].trim())
          : normalizeSlug(goalText.slice(0, 35)) || "san-pham";
        const subjectKind = subjectMatch?.[1] ? "catalog_product" : "free_topic";

        // Dynamically deduce Call To Action
        const lowerText = goalText.toLowerCase();
        let dynamicCta = "Khám phá ngay tại NovaCommerce Store";
        if (lowerText.includes("đặt trước") || lowerText.includes("pre-order")) {
          dynamicCta = "Đặt trước ngay hôm nay";
        } else if (lowerText.includes("giảm giá") || lowerText.includes("khuyến mãi") || lowerText.includes("ưu đãi") || lowerText.includes("sale")) {
          dynamicCta = "Săn ưu đãi ngay";
        } else if (lowerText.includes("mua")) {
          dynamicCta = "Mua ngay nhận quà liền tay";
        }

        // Extract a clean campaign name
        const cleanName =
          goalText.length > 70
            ? `${goalText.slice(0, 68)}...`
            : goalText.replace(
                /^(chỉ thị|chỉ đạo|nghị quyết|lệnh điều hành|hãy|yêu cầu|triển khai|lên bài|đăng bài)(?:\s+(?:từ\s+)?(?:tổng\s+giám\s+đốc|ceo|ban\s+giám\s+đốc|hội\s+đồng\s+quản\s+trị))?[:\s-]*/i,
                "",
              );

        // Setup AI CEO Strategic Decomposition Plan
        setCeoPlan({
          goal: goalText,
          targetDept: "Phòng Tiếp thị & Sáng tạo",
          steps: [
            {
              role: "Cây bút Tiếp thị (Copywriter)",
              task: `Soạn tiêu đề giật tít, nội dung bài viết và bộ hashtag cho: "${cleanName}"`,
              status: "running",
            },
            {
              role: "Thiết kế Đồ họa (Visual Designer)",
              task: `Thiết kế đồ họa sản phẩm vuông 1:1 chuẩn Facebook (1080x1080 PNG)`,
              status: "pending",
            },
            {
              role: "Điều phối Xuất bản (Publisher)",
              task: `Đóng gói Publication Package, tính toán băm SHA-256 đối soát`,
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: `Phê duyệt bản thảo & kích hoạt xuất bản bài viết lên Fanpage Facebook`,
              status: "pending",
            },
          ],
        });

        // Stage 1: AI CEO Intake & Dispatch
        setMarketingActiveAgent("ceo");
        setMarketingAgentMessage("👑 AI CEO đang phân tích yêu cầu chiến lược, lập kế hoạch và phân bổ 3 nhân sự số...");

        const createdCampaign = await marketingApi.createCampaign(
          {
            campaignName: `Chiến dịch: ${cleanName}`,
            objective: `Quảng bá sản phẩm và đăng bài lên mạng xã hội theo mục tiêu: ${goalText}`,
            subjectKind,
            subjectReference: dynamicSubjectRef,
            language: "vi",
            mandatoryMessage: goalText,
            prohibitedClaims: ["sản phẩm duy nhất vũ trụ", "chữa bách bệnh", "làm giàu không khó"],
            callToAction: dynamicCta,
            facebookPageConfigurationId: "1321445584378490",
            scheduledFor: scheduledTime,
            deadline: deadlineTime,
            approverId: "staff-director-owner-01",
            maximumCostMicros: 500000,
          },
          idempotencyKey,
        );

        setActiveCampaignId(createdCampaign.id);
        await new Promise((r) => setTimeout(r, 1200));

        // Stage 2: Copywriter drafting
        setDeptActiveAgent("marketing", "marketing_copywriter", `✍️ Cây bút Tiếp thị đang soạn thảo nội dung, kiểm duyệt chính sách và bộ hashtag cho "${cleanName}"...`);
        setMarketingActiveAgent("marketing_content");
        setMarketingAgentMessage(`✍️ Cây bút Tiếp thị đang soạn thảo nội dung, kiểm duyệt chính sách và bộ hashtag cho "${cleanName}"...`);
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) => (idx === 0 ? { ...s, status: "running" } : s)),
              }
            : null,
        );

        await marketingApi.markReady(createdCampaign.id);
        await new Promise((r) => setTimeout(r, 1400));

        // Stage 3: Visual Designer generating creative
        setDeptActiveAgent("marketing", "marketing_visual", `🎨 Thiết kế Đồ họa đang dựng đồ họa sản phẩm vuông 1:1 ánh sáng studio cho "${cleanName}"...`, "marketing_copywriter");
        setMarketingActiveAgent("marketing_visual");
        setMarketingAgentMessage(`🎨 Thiết kế Đồ họa đang dựng đồ họa sản phẩm vuông 1:1 ánh sáng studio cho "${cleanName}"...`);
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 0 ? { ...s, status: "done" } : idx === 1 ? { ...s, status: "running" } : s,
                ),
              }
            : null,
        );

        await marketingApi.requestRevision(createdCampaign.id, {
          feedback: `Triển khai sáng tạo bài viết và hình ảnh theo đúng yêu cầu: ${goalText}`,
        });
        await new Promise((r) => setTimeout(r, 1400));

        // Stage 4: Publisher packaging
        setDeptActiveAgent("marketing", "marketing_publisher", `📦 Điều phối Xuất bản đang kiểm tra checklist an toàn và đóng gói bản thảo...`, "marketing_visual");
        setMarketingActiveAgent("marketing_publisher");
        setMarketingAgentMessage(`📦 Điều phối Xuất bản đang kiểm tra checklist an toàn và đóng gói bản thảo...`);
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx === 1 ? { ...s, status: "done" } : idx === 2 ? { ...s, status: "running" } : s,
                ),
              }
            : null,
        );
        await new Promise((r) => setTimeout(r, 1000));

        // Stage 5: Ready for Human Approval
        setDeptStatus((prev) => ({
          ...prev,
          marketing: {
            activeAgent: null,
            agentMessage: null,
            completedAgents: ["marketing_copywriter", "marketing_visual", "marketing_publisher"],
          },
        }));
        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx <= 2 ? { ...s, status: "done" } : { ...s, status: "running" },
                ),
              }
            : null,
        );

        try {
          await marketingApi.generateDeliverables(createdCampaign.id);
        } catch {
          // Ignored if deliverables fail
        }

        const detail = await marketingApi.getCampaign(createdCampaign.id);
        setActiveCampaignDetail(detail);

        setSuccessMessage(`AI CEO đã điều phối hoàn tất bản thảo chiến dịch! Sẵn sàng để bạn duyệt xuất bản.`);
        setPrompt("");
      } else {
        scrollToDepartment("dept-column-support");
        // Route to Orchestration (Store Health / Operations / Finance / Support)
        setActiveWorkflowKind("orchestration");
        const idempotencyKey = crypto.randomUUID();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const created = await api.createTask(
          {
            mode: "advanced",
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
        setSuccessMessage(`AI CEO đã điều phối nhiệm vụ tới các phòng ban vận hành!`);
        setPrompt("");
        if (onTaskCreated) onTaskCreated();
      }
    } catch (error) {
      console.error("Failed to execute strategic task:", error);
      setErrorMessage(error instanceof Error ? error.message : "Không thể gửi tác vụ đến hệ thống.");
    } finally {
      setIsSubmitting(false);
      setActiveLocks((prevLocks) => {
        const remaining = releaseLocks(strategicAgents, prevLocks);
        notifyResourceWaiters(strategicAgents);
        setTimeout(() => processNextQueuedTask(remaining), 50);
        return remaining;
      });
    }
  };

  // Auto-process next queued task whose resources are completely free
  const processNextQueuedTask = (currentLocks: Record<string, ResourceLock>) => {
    const candidate = getNextEligibleTask(departmentQueuesRef.current, currentLocks);
    if (!candidate) return;

    const { dept, task } = candidate;
    setDepartmentQueues((prevQueues) => ({
      ...prevQueues,
      [dept]: prevQueues[dept].filter((t) => t.id !== task.id),
    }));

    setActiveLocks((active) =>
      acquireLocks(task.id, dept, task.requiredAgents, task.prompt, active),
    );

    void executeDepartmentWorkflow(dept, task.prompt, task.requiredAgents, task.id);
  };

  // Direct Execution Workflow for individual departments
  const executeDepartmentWorkflow = async (
    dept: DepartmentType,
    taskPrompt: string,
    reqAgents: string[],
    taskId: string,
  ) => {
    try {
      if (dept === "marketing" && marketingApi) {
        scrollToDepartment("dept-column-marketing");
        setActiveWorkflowKind("marketing");

        // Step 1: Copywriter
        setDeptActiveAgent("marketing", "marketing_copywriter", `Cây bút Sáng tạo đang soạn nội dung: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("marketing_copywriter");
        setMarketingAgentMessage(`Cây bút Sáng tạo đang soạn nội dung: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

        // Step 2: Visual Designer
        setDeptActiveAgent("marketing", "marketing_visual", "Thiết kế Đồ họa đang dựng poster và banner...", "marketing_copywriter");
        setMarketingActiveAgent("marketing_visual");
        setMarketingAgentMessage("Thiết kế Đồ họa đang dựng poster và banner...");
        await new Promise((r) => setTimeout(r, 800));

        // Step 3: Publisher
        setDeptActiveAgent("marketing", "marketing_publisher", "Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage...", "marketing_visual");
        setMarketingActiveAgent("marketing_publisher");
        setMarketingAgentMessage("Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage...");
        await new Promise((r) => setTimeout(r, 800));

        const scheduledTime = new Date(Date.now() + 3600 * 1000).toISOString();
        const deadlineTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const idempotencyKey = crypto.randomUUID();

        const createdCampaign = await marketingApi.createCampaign(
          {
            campaignName: `Chiến dịch: ${taskPrompt.slice(0, 45)}`,
            objective: `Quảng bá sản phẩm và đăng bài lên mạng xã hội theo mục tiêu: ${taskPrompt}`,
            subjectKind: "free_topic",
            subjectReference: "san-pham",
            language: "vi",
            mandatoryMessage: taskPrompt,
            prohibitedClaims: ["sản phẩm duy nhất vũ trụ", "chữa bách bệnh", "làm giàu không khó"],
            callToAction: "Khám phá ngay tại NovaCommerce Store",
            facebookPageConfigurationId: "1321445584378490",
            scheduledFor: scheduledTime,
            deadline: deadlineTime,
            approverId: "staff-director-owner-01",
            maximumCostMicros: 500000,
          },
          idempotencyKey,
        );
        setActiveCampaignId(createdCampaign.id);
        await marketingApi.markReady(createdCampaign.id);
        await marketingApi.requestRevision(createdCampaign.id, {
          feedback: `Triển khai sáng tạo bài viết và hình ảnh theo đúng yêu cầu: ${taskPrompt}`,
        });
        try {
          await marketingApi.generateDeliverables(createdCampaign.id);
        } catch {
          // Ignored
        }
        const detail = await marketingApi.getCampaign(createdCampaign.id);
        setActiveCampaignDetail(detail);

        setDeptStatus((prev) => ({
          ...prev,
          marketing: {
            activeAgent: null,
            agentMessage: null,
            completedAgents: ["marketing_copywriter", "marketing_visual", "marketing_publisher"],
          },
        }));
        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setSuccessMessage("Đã hoàn tất soạn thảo chiến dịch Marketing!");
      } else if (dept === "merchandising" && catalogApi) {
        scrollToDepartment("dept-column-merchandising");
        setActiveWorkflowKind("merchandising");

        // Step 1: Catalog Copywriter
        setDeptActiveAgent("merchandising", "catalog_copywriter", `Cây bút Sản phẩm đang tối ưu tiêu đề SEO cho: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("catalog_copywriter");
        setMarketingAgentMessage(`Cây bút Sản phẩm đang tối ưu tiêu đề SEO cho: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

        // Step 1 complete
        setDeptActiveAgent("merchandising", null, "Đã hoàn thành tối ưu SEO và mô tả danh mục", "catalog_copywriter");

        // Step 2: Cross-department visual collab if required
        if (reqAgents.includes("marketing_visual")) {
          // Check if marketing_visual is locked by another task/department
          if (activeLocksRef.current["marketing_visual"]) {
            const heldLock = activeLocksRef.current["marketing_visual"];
            setPendingHandoff({
              dept: "merchandising",
              taskId,
              prompt: taskPrompt,
              waitingForAgent: "marketing_visual",
              waitingForDept: heldLock.lockedByDepartment,
              stepName: "Thiết kế Poster & Banner 3D",
            });
            try {
              await waitForResource("marketing_visual", taskId);
            } catch (e: any) {
              if (e?.message === "Handoff cancelled by user") return;
              throw e;
            }
            setPendingHandoff(null);
          }

          // Acquire lock for marketing_visual
          setActiveLocks((active) =>
            acquireLocks(taskId, "merchandising", ["marketing_visual"], taskPrompt, active),
          );

          // Chiều đi: Merchandising -> Marketing
          setActiveCollaboration({
            fromDept: "merchandising",
            toDept: "marketing",
            label: "⚡ Bàn giao: Yêu cầu Thiết kế Poster & Banner 3D",
          });
          setDeptActiveAgent("merchandising", null, "Đang bàn giao yêu cầu sang Thiết kế Đồ họa (Tiếp thị)...", "catalog_copywriter");
          setDeptActiveAgent("marketing", "marketing_visual", "Phối hợp cùng Danh mục: Đang vẽ poster ưu đãi & badge 3D...");
          setMarketingActiveAgent("merchandising_visual_collab");
          setMarketingAgentMessage("Phối hợp Thiết kế Đồ họa đang vẽ poster ưu đãi & badge 3D...");
          await new Promise((r) => setTimeout(r, 1000));

          // Chiều về: Marketing -> Merchandising
          setDeptActiveAgent("marketing", null, "Đã hoàn thành thiết kế, đang bàn giao lại kết quả...", "marketing_visual");
          setActiveCollaboration({
            fromDept: "marketing",
            toDept: "merchandising",
            label: "⚡ Bàn giao lại: Hoàn tất Poster & Banner ➔ Danh mục",
          });
          await new Promise((r) => setTimeout(r, 1000));
          setActiveCollaboration(null);
          setDeptActiveAgent("marketing", null, null, "marketing_visual");

          // Release marketing_visual lock and notify waiters
          setActiveLocks((active) => {
            const remaining = releaseLocks(["marketing_visual"], active);
            notifyResourceWaiters(["marketing_visual"]);
            return remaining;
          });
        }

        // Step 3: Pricing Strategist
        setDeptActiveAgent("merchandising", "pricing_strategist", "Chuyên gia Định giá đang tính toán chiết khấu & biên lợi nhuận...", "catalog_copywriter");
        setMarketingActiveAgent("pricing_strategist");
        setMarketingAgentMessage("Chuyên gia Định giá đang tính toán chiết khấu & biên lợi nhuận...");
        await new Promise((r) => setTimeout(r, 800));

        const cProposal = await catalogApi.generateCampaignProposal({ prompt: taskPrompt });
        setCampaignProposal(cProposal);
        setCampaignProposalModalOpen(true);

        setDeptStatus((prev) => ({
          ...prev,
          merchandising: {
            activeAgent: null,
            agentMessage: null,
            completedAgents: ["catalog_copywriter", "pricing_strategist"],
          },
        }));
        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setSuccessMessage("Đã lập xong Đề xuất Chiến dịch Danh mục & Định giá!");
      } else if (dept === "operations" && inventoryApi) {
        scrollToDepartment("dept-column-operations");
        setActiveWorkflowKind("operations");

        // Step 1: Inventory Specialist
        setDeptActiveAgent("operations", "inventory_specialist", `Kỹ sư Tồn kho đang kiểm toán dữ liệu SKU cho: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("inventory_specialist");
        setMarketingAgentMessage(`Kỹ sư Tồn kho đang kiểm toán dữ liệu SKU cho: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

        // Step 2: Order Coordinator
        setDeptActiveAgent("operations", "order_coordinator", "Điều phối Đơn hàng đang lập phiếu đề xuất nhập kho...", "inventory_specialist");
        setMarketingActiveAgent("order_coordinator");
        setMarketingAgentMessage("Điều phối Đơn hàng đang lập phiếu đề xuất nhập kho...");
        await new Promise((r) => setTimeout(r, 800));

        const proposal = await inventoryApi.generateOperationsProposal(taskPrompt);
        setOperationsProposal(proposal);
        setIsOperationsModalOpen(true);
        setOperationsPage(1);

        setDeptStatus((prev) => ({
          ...prev,
          operations: {
            activeAgent: null,
            agentMessage: null,
            completedAgents: ["inventory_specialist", "order_coordinator"],
          },
        }));
        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setSuccessMessage("Đã lập xong Phiếu Đề Xuất Nhập Kho!");
      } else if (dept === "support" && supportApi) {
        scrollToDepartment("dept-column-support");
        setActiveWorkflowKind("support");

        // Step 1: Support Steward
        setDeptActiveAgent("support", "support_steward", `Quản gia CSKH đang rà soát ticket sự cố cho: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("support_steward");
        setMarketingAgentMessage(`Quản gia CSKH đang rà soát ticket sự cố cho: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

        // Step 2: CRM Specialist
        setDeptActiveAgent("support", "crm_specialist", "Chuyên viên CRM đang phân tích khách hàng VIP & lập báo cáo...", "support_steward");
        setMarketingActiveAgent("crm_specialist");
        setMarketingAgentMessage("Chuyên viên CRM đang phân tích khách hàng VIP & lập báo cáo...");
        await new Promise((r) => setTimeout(r, 800));

        const proposal = await supportApi.generateSupportProposal(taskPrompt);
        setSupportProposal(proposal);
        setSupportTicketsPage(1);
        setSupportVipPage(1);

        setDeptStatus((prev) => ({
          ...prev,
          support: {
            activeAgent: null,
            agentMessage: null,
            completedAgents: ["support_steward", "crm_specialist"],
          },
        }));
        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
        setSuccessMessage("Đã lập xong Đề xuất Xử lý CSKH & CRM!");
      }
    } catch (err: any) {
      console.error(`Execution error in ${dept}:`, err);
      setErrorMessage(err?.message || `Thực thi nhiệm vụ cho phòng ban ${dept} thất bại.`);
      setActiveCollaboration(null);
      setDeptActiveAgent(dept, null);
      setMarketingActiveAgent(null);
      setMarketingAgentMessage(null);
    } finally {
      setActiveCollaboration(null);
      // Guaranteed lock release and auto-dequeue check
      setActiveLocks((prevLocks) => {
        const remaining = releaseLocks(reqAgents, prevLocks);
        notifyResourceWaiters(reqAgents);
        setTimeout(() => processNextQueuedTask(remaining), 50);
        return remaining;
      });
    }
  };

  // Direct Department-level Task Delegation (1 unblocked input per department)
  const handleDepartmentDirectTask = async (
    departmentType: DepartmentType,
    directPrompt: string,
  ) => {
    if (!directPrompt.trim()) return;

    const reqAgents = analyzeTaskRequirements(departmentType, directPrompt);
    const initialAgent = getInitialAgentForDepartment(departmentType);
    const initialConflict = activeLocksRef.current[initialAgent];

    if (initialConflict) {
      const newTask: DepartmentTask = {
        id: crypto.randomUUID(),
        department: departmentType,
        prompt: directPrompt,
        requiredAgents: reqAgents,
        status: "queued",
        waitingForResource: {
          agentId: initialConflict.agentId,
          agentName: DIGITAL_EMPLOYEES[initialConflict.agentId]?.name || initialConflict.agentId,
          heldByDepartment: initialConflict.lockedByDepartment,
          taskPromptSnippet: initialConflict.taskPromptSnippet,
        },
        queuedAt: Date.now(),
      };

      setDepartmentQueues((prev) => ({
        ...prev,
        [departmentType]: [...prev[departmentType], newTask],
      }));

      setSuccessMessage(
        `Nhiệm vụ đã được thêm vào hàng chờ (đang đợi nhân sự ${
          DIGITAL_EMPLOYEES[initialConflict.agentId]?.name || initialConflict.agentId
        } hoàn tất công việc).`,
      );
      return;
    }

    // Initial agent is free: execute immediately!
    const taskId = crypto.randomUUID();
    const localAgents = reqAgents.filter(
      (ag) => DIGITAL_EMPLOYEES[ag]?.department === departmentType,
    );
    setActiveLocks((prev) =>
      acquireLocks(taskId, departmentType, localAgents.length > 0 ? localAgents : [initialAgent], directPrompt, prev),
    );
    await executeDepartmentWorkflow(departmentType, directPrompt, reqAgents, taskId);
  };

  // Support Actions
  const handleDownloadSupportDocx = async () => {
    if (!supportProposal?.id || !supportApi) return;
    try {
      setIsDownloadingSupportDocx(true);
      await supportApi.downloadSupportDocx(
        supportProposal.id,
        supportProposal.docxFilename || `bao_cao_cskh_${supportProposal.id.slice(0, 8)}.docx`,
      );
    } catch (err) {
      console.error("Failed to download Support DOCX:", err);
      setErrorMessage(err instanceof Error ? err.message : "Không thể tải file Word Báo cáo CSKH.");
    } finally {
      setIsDownloadingSupportDocx(false);
    }
  };

  const handleApplySupport = async () => {
    if (!supportProposal?.id || !supportApi) return;
    try {
      setSupportActionLoading(true);
      setErrorMessage(null);
      const items = supportProposal.tickets.map((t) => ({
        ticketId: t.ticketId,
        responseMessage: t.proposedResponse,
        resolutionStatus: "resolved" as const,
      }));
      await supportApi.applySupportProposal(supportProposal.id, items);
      setSupportProposal((prev) => (prev ? { ...prev, status: "applied" } : null));
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );
      setSuccessMessage(`✅ Đã phê duyệt và gửi phản hồi CSKH thành công cho toàn bộ ${supportProposal.tickets.length} ticket!`);
    } catch (err) {
      console.error("Failed to apply support proposal:", err);
      setErrorMessage(err instanceof Error ? err.message : "Không thể gửi phản hồi CSKH.");
    } finally {
      setSupportActionLoading(false);
    }
  };

  // Marketing Actions
  const handleApproveMarketing = async () => {
    if (!activeCampaignId || !marketingApi) return;
    try {
      setMarketingActionLoading(true);
      setErrorMessage(null);
      await marketingApi.approveCampaign(activeCampaignId, { decision: "approve" });
      const detail = await marketingApi.getCampaign(activeCampaignId);
      setActiveCampaignDetail(detail);

      // Complete all steps in CEO Plan
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );
      setMarketingActiveAgent(null);
      setMarketingAgentMessage(null);

      // Refresh recent campaigns list
      marketingApi.listCampaigns({ limit: 10 }).then((res) => setCampaignsList(res.items)).catch(() => {});

      setSuccessMessage("Đã duyệt và xuất bản bài viết thành công lên Fanpage Facebook!");
    } catch (err: any) {
      setErrorMessage(err.message || "Phê duyệt thất bại.");
    } finally {
      setMarketingActionLoading(false);
    }
  };

  const handleRevisionMarketing = async () => {
    if (!activeCampaignId || !marketingApi || !revisionInput.trim()) return;
    try {
      setMarketingActionLoading(true);
      setErrorMessage(null);
      await marketingApi.requestRevision(activeCampaignId, { feedback: revisionInput });
      const detail = await marketingApi.getCampaign(activeCampaignId);
      setActiveCampaignDetail(detail);
      setRevisionInput("");
      setShowRevisionForm(false);
      setSuccessMessage("Đã gửi yêu cầu chỉnh sửa! 3 nhân sự số Marketing đang tạo lại bản sửa đổi mới.");
    } catch (err: any) {
      setErrorMessage(err.message || "Yêu cầu chỉnh sửa thất bại.");
    } finally {
      setMarketingActionLoading(false);
    }
  };

  const handleRetryPublication = async () => {
    if (!activeCampaignId || !marketingApi) return;
    try {
      setMarketingActionLoading(true);
      setErrorMessage(null);
      await marketingApi.retryPublication(activeCampaignId);
      const detail = await marketingApi.getCampaign(activeCampaignId);
      setActiveCampaignDetail(detail);

      // Complete all steps in CEO Plan
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );
      setMarketingActiveAgent(null);
      setMarketingAgentMessage(null);

      // Refresh recent campaigns list
      marketingApi.listCampaigns({ limit: 10 }).then((res) => setCampaignsList(res.items)).catch(() => {});

      setSuccessMessage("Đã xuất bản lại thành công lên Facebook!");
    } catch (err: any) {
      setErrorMessage(err.message || "Đăng lại lên Facebook thất bại.");
    } finally {
      setMarketingActionLoading(false);
    }
  };

  const handleGenerateDeliverables = async () => {
    if (!activeCampaignId || !marketingApi) return;
    try {
      setMarketingActionLoading(true);
      setErrorMessage(null);
      await marketingApi.generateDeliverables(activeCampaignId);
      const detail = await marketingApi.getCampaign(activeCampaignId);
      setActiveCampaignDetail(detail);
      setSuccessMessage("Đã xuất đầy đủ 5 tài liệu bàn giao (DOCX, PNG, XLSX, PDF)!");
    } catch (err: any) {
      setErrorMessage(err.message || "Xuất tài liệu thất bại.");
    } finally {
      setMarketingActionLoading(false);
    }
  };

  const handleApplyMerchandisingProposal = async () => {
    if (!catalogApi || !merchandisingProposal || merchandisingLoading) return;
    try {
      setMerchandisingLoading(true);
      setErrorMessage(null);

      if (campaignProposal) {
        await catalogApi.activateCampaign(campaignProposal.id);
        const active = await catalogApi.getActiveCampaign();
        setActiveCampaign(active);
        setCampaignProposalModalOpen(false);
        setCampaignProposal(null);
        setMerchandisingProposal((prev) =>
          prev
            ? {
                ...prev,
                status: "applied",
              }
            : null,
        );
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s) => ({ ...s, status: "done" })),
              }
            : null,
        );
        setSuccessMessage(`Chiến dịch "${campaignProposal.name}" đã được kích hoạt thành công trên Storefront với giá chiết khấu thời gian thực!`);
        return;
      }

      const result = await catalogApi.applyMerchandisingProposal({
        proposalId: merchandisingProposal.id,
      });

      const active = await catalogApi.getActiveCampaign();
      setActiveCampaign(active);

      setMerchandisingProposal((prev) =>
        prev
          ? {
              ...prev,
              status: "applied",
            }
          : null,
      );

      // Complete all steps in CEO Plan
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );

      const msg =
        result.items && result.items.length > 1
          ? `Đã cập nhật giá bán mới và mô tả tối ưu cho ${result.items.length} sản phẩm trực tiếp lên Cửa hàng Storefront!`
          : `Đã cập nhật giá bán mới (${(result.newPriceVnd || result.items?.[0]?.newPriceVnd || 0).toLocaleString("vi-VN")} đ) và mô tả tối ưu trực tiếp lên Cửa hàng Storefront!`;
      setSuccessMessage(msg);
    } catch (err: any) {
      console.error("Apply merchandising proposal failed:", err);
      setErrorMessage(err.message || "Không thể áp dụng đề xuất lên Storefront.");
    } finally {
      setMerchandisingLoading(false);
    }
  };

  const handleApproveCampaign = async (options: { readonly endDate: string; readonly excludedItemIds: readonly string[] }) => {
    if (!catalogApi || !campaignProposal) return;
    try {
      setIsActivatingCampaign(true);
      setErrorMessage(null);
      await catalogApi.activateCampaign(campaignProposal.id, {
        endDate: options.endDate,
        excludedItemIds: options.excludedItemIds,
      });
      setCampaignProposalModalOpen(false);
      setCampaignProposal(null);
      setMerchandisingProposal((prev) =>
        prev
          ? {
              ...prev,
              status: "applied",
            }
          : null,
      );
      const active = await catalogApi.getActiveCampaign();
      setActiveCampaign(active);

      // Complete steps in CEO Plan
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );

      setSuccessMessage(`Chiến dịch "${campaignProposal.name}" đã được kích hoạt thành công trên Storefront với giá chiết khấu thời gian thực!`);
    } catch (err: any) {
      console.error("Activate campaign failed:", err);
      setErrorMessage(err.message || "Kích hoạt chiến dịch thất bại.");
    } finally {
      setIsActivatingCampaign(false);
    }
  };

  const handleEmergencyRevertCampaign = async (campaignId: string) => {
    if (!catalogApi) return;
    try {
      setIsRevertingCampaign(true);
      setErrorMessage(null);
      await catalogApi.revertCampaign(campaignId);
      setActiveCampaign(null);
      setSuccessMessage("Đã hoàn nguyên chiến dịch thành công! Toàn bộ giá sản phẩm đã tự động quay về mức ban đầu.");
    } catch (err: any) {
      console.error("Revert campaign failed:", err);
      setErrorMessage(err.message || "Hoàn nguyên chiến dịch thất bại.");
    } finally {
      setIsRevertingCampaign(false);
    }
  };

  const handleApplyOperations = async (
    items?: readonly { variantId: string; restockQuantity: number }[],
  ) => {
    if (!operationsProposal?.id || !inventoryApi || operationsActionLoading) return;
    try {
      setOperationsActionLoading(true);
      setErrorMessage(null);
      const payload = items && items.length > 0
        ? items
        : operationsProposal.items.map((i) => ({
            variantId: i.variantId,
            restockQuantity: i.recommendedRestockQuantity,
          }));
      const res: any = await (inventoryApi.applyReplenishmentProposal
        ? inventoryApi.applyReplenishmentProposal(operationsProposal.id, payload)
        : inventoryApi.applyOperationsProposal(operationsProposal.id, payload));
      setPendingReplenishment(null);
      setOperationsProposal((prev) => {
        if (!prev) return null;
        const updatedItemsMap = new Map<string, number>(
          (res?.updatedItems ?? []).map((u: any) => [u.variantId, u.newOnHand]),
        );
        return {
          ...prev,
          status: "applied",
          items: prev.items.map((it) => {
            const newOnHand = updatedItemsMap.get(it.variantId);
            if (newOnHand !== undefined) {
              return {
                ...it,
                currentOnHand: newOnHand,
                availableQuantity: Math.max(0, newOnHand - it.currentReserved),
              };
            }
            return it;
          }),
        };
      });

      // Complete all steps in CEO Plan
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );

      const totalRestocked = payload.reduce((acc, it) => acc + it.restockQuantity, 0);
      setSuccessMessage(`✅ Đã phê duyệt và nhập kho thành công +${totalRestocked} đơn vị hàng vào cơ sở dữ liệu PostgreSQL!`);
    } catch (err) {
      console.error("Failed to apply operations proposal:", err);
      setErrorMessage(err instanceof Error ? err.message : "Không thể nhập kho vào hệ thống.");
    } finally {
      setOperationsActionLoading(false);
    }
  };

  const handleTriggerClearanceCampaign = async (
    slowMovingItems: readonly OperationsProposalItem[],
  ) => {
    setIsOperationsModalOpen(false);

    // GIAI ĐOẠN 0: AI CEO Ban hành Chỉ đạo Chiến lược từ trên giao xuống
    setActiveWorkflowKind("operations");
    setMarketingActiveAgent("ceo");
    setMarketingAgentMessage(
      `👑 AI CEO ban hành Chỉ thị Chiến lược: Phê duyệt đề xuất xả hàng, giao liên phòng Kho vận ➔ Định giá ➔ Tiếp thị khẩn trương phối hợp giải phóng thanh khoản ${slowMovingItems.length} SKU tồn đọng...`,
    );

    setCeoPlan({
      goal: `Chỉ thị từ AI CEO: Phối hợp liên phòng giải phóng thanh khoản cho ${slowMovingItems.length} sản phẩm tồn đọng vốn`,
      targetDept: "AI CEO ➔ Kho vận ➔ Danh mục & Định giá ➔ Tiếp thị",
      steps: [
        {
          role: "AI CEO (Ban Giám đốc)",
          task: `Ban hành Chỉ thị Chiến lược: Điều phối liên phòng giải phóng thanh khoản ${slowMovingItems.length} SKU tồn đọng vốn`,
          status: "running",
        },
        {
          role: "Kỹ sư Tồn kho (Phòng Kho vận)",
          task: `Tiếp nhận chỉ thị, rà soát đối soát ${slowMovingItems.length} SKU tồn đọng và bàn giao hồ sơ số liệu`,
          status: "pending",
        },
        {
          role: "Chuyên gia Định giá (Phòng Định giá)",
          task: `Thiết lập bảng giá thanh lý chiết khấu -25% đến -35% và bảo toàn biên lợi nhuận`,
          status: "pending",
        },
        {
          role: "Thiết kế Đồ họa (Phòng Tiếp thị)",
          task: `Thiết kế Poster & Banner sản phẩm với nhận diện 'CLEARANCE SALE'`,
          status: "pending",
        },
        {
          role: "Chủ tịch / Ban Giám đốc",
          task: `Phê duyệt nghiệm thu và kích hoạt chiến dịch Xả kho lên Storefront`,
          status: "pending",
        },
      ],
    });

    // Pacing for CEO Directive initiation (1.2s)
    await new Promise((r) => setTimeout(r, 1200));

    // GIAI ĐOẠN 1: Bàn giao xuống Phòng Vận hành & Kho vận - Kỹ sư Tồn kho tiếp nhận
    scrollToDepartment("dept-column-operations");
    setDeptActiveAgent("operations", "inventory_specialist", `📦 Kỹ sư Tồn kho tiếp nhận Chỉ thị từ CEO, đang rà soát dữ liệu đối soát ${slowMovingItems.length} SKU tồn đọng...`);
    setMarketingActiveAgent("inventory_clearance_handoff");
    setMarketingAgentMessage(
      `📦 Kỹ sư Tồn kho tiếp nhận Chỉ thị từ CEO, đang rà soát dữ liệu đối soát ${slowMovingItems.length} SKU tồn đọng và chuẩn bị bàn giao sang Phòng Danh mục...`,
    );

    setCeoPlan((prev) =>
      prev
        ? {
            ...prev,
            steps: prev.steps.map((s, idx) =>
              idx === 0
                ? { ...s, status: "done" }
                : idx === 1
                  ? { ...s, status: "running" }
                  : s,
            ),
          }
        : null,
    );

    // Pacing animation for Stage 1 so user perceives the inventory engineer working
    await new Promise((r) => setTimeout(r, 1400));

    // GIAI ĐOẠN 2: Chuyển giao sang Phòng Danh mục & Định giá - Chuyên gia Định giá tính toán chiết khấu
    scrollToDepartment("dept-column-merchandising");
    setActiveWorkflowKind("merchandising");
    setActiveCollaboration({
      fromDept: "operations",
      toDept: "merchandising",
      label: "Bàn giao: Dữ liệu SKU Xả kho",
    });
    setDeptActiveAgent("operations", null, null, "inventory_specialist");
    setDeptActiveAgent("merchandising", "pricing_strategist", "📊 Chuyên gia Định giá đã tiếp nhận hồ sơ từ Kho vận, đang tính toán giá thanh lý chiết khấu...");
    setMarketingActiveAgent("merchandising_clearance_calc");
    setMarketingAgentMessage(
      `📊 Chuyên gia Định giá đã tiếp nhận hồ sơ từ Kho vận, đang tính toán giá thanh lý chiết khấu và thiết lập biên lợi nhuận xả hàng...`,
    );

    setCeoPlan((prev) =>
      prev
        ? {
            ...prev,
            steps: prev.steps.map((s, idx) =>
              idx <= 1
                ? { ...s, status: "done" }
                : idx === 2
                  ? { ...s, status: "running" }
                  : s,
            ),
          }
        : null,
    );

    // Pacing animation for Stage 2 so user perceives the pricing specialist calculating
    await new Promise((r) => setTimeout(r, 1400));
    setActiveCollaboration(null);

    // GIAI ĐOẠN 3: Chuyển giao sang Phòng Tiếp thị & Sáng tạo - Thiết kế Đồ họa vẽ poster & banner
    scrollToDepartment("dept-column-marketing");
    setActiveWorkflowKind("marketing");
    setActiveCollaboration({
      fromDept: "merchandising",
      toDept: "marketing",
      label: "Bàn giao: Thiết kế Poster & Huy hiệu 3D Xả hàng",
    });
    setDeptActiveAgent("merchandising", null, null, "pricing_strategist");
    setDeptActiveAgent("marketing", "marketing_visual", "🎨 Thiết kế Đồ họa đang vẽ poster quảng bá, thiết kế banner và gắn huy hiệu 3D CLEARANCE SALE...");
    setMarketingActiveAgent("merchandising_visual_collab");
    setMarketingAgentMessage(
      `🎨 Thiết kế Đồ họa đang vẽ poster quảng bá, thiết kế banner và gắn huy hiệu 3D CLEARANCE SALE cho các sản phẩm...`,
    );

    setCeoPlan((prev) =>
      prev
        ? {
            ...prev,
            steps: prev.steps.map((s, idx) =>
              idx <= 2
                ? { ...s, status: "done" }
                : idx === 3
                  ? { ...s, status: "running" }
                  : s,
            ),
          }
        : null,
    );

    if (catalogApi) {
      const itemNames = slowMovingItems.map((i) => i.productName).slice(0, 3).join(", ");
      const clearancePrompt = `Chiến dịch xả kho thanh lý giảm giá 30% cho các sản phẩm tồn đọng: ${itemNames}`;
      try {
        const [campaign] = await Promise.all([
          catalogApi.generateCampaignProposal({ prompt: clearancePrompt }),
          new Promise((r) => setTimeout(r, 1600)), // Guarantee visual duration so poster drawing animation is clearly visible
        ]);

        setCampaignProposal(campaign);

        // GIAI ĐOẠN 4: Chiều về: Tiếp thị hoàn tất poster, bàn giao kết quả về lại Kho vận
        setDeptActiveAgent("marketing", null, "Đã hoàn thành bộ poster và gói xả hàng, đang bàn giao lại...", "marketing_visual");
        setActiveCollaboration({
          fromDept: "marketing",
          toDept: "operations",
          label: "⚡ Bàn giao lại: Hoàn tất Kế hoạch & Poster Xả kho ➔ Kho vận",
        });
        await new Promise((r) => setTimeout(r, 1200));
        setActiveCollaboration(null);
        setDeptActiveAgent("marketing", null, null, "marketing_visual");
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx <= 3
                    ? { ...s, status: "done" }
                    : idx === 4
                      ? { ...s, status: "running" }
                      : s,
                ),
              }
            : null,
        );

        setCampaignProposalModalOpen(true);
        setSuccessMessage("Đội ngũ liên phòng (Kho vận ➔ Định giá ➔ Tiếp thị) đã hoàn tất thiết kế & định giá chiến dịch Xả kho theo Chỉ thị của CEO! Sẵn sàng để bạn phê duyệt.");
      } catch (err: any) {
        setActiveCollaboration(null);
        setErrorMessage("Không thể tạo chiến dịch xả kho tự động: " + (err.message || String(err)));
      } finally {
        setActiveCollaboration(null);
        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);
      }
    }
  };

  const handleDownloadOperationsDocx = async () => {
    if (!operationsProposal?.id || !inventoryApi) return;
    try {
      setIsDownloadingDocx(true);
      await inventoryApi.downloadOperationsDocx(
        operationsProposal.id,
        operationsProposal.docxFilename || `bao_cao_kiem_toan_kho_van_${operationsProposal.id.slice(0, 8)}.docx`,
      );
    } catch (err) {
      console.error("Failed to download DOCX:", err);
      setErrorMessage(err instanceof Error ? err.message : "Không thể tải file Word báo cáo.");
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  const handleStopTask = async () => {
    if (activeWorkflowKind === "orchestration" && activeRunId && activeOperations?.workflow) {
      try {
        await api.cancelWorkflow(activeRunId, activeOperations.workflow.version, "CANCELED_BY_STAFF");
        const updated = await api.loadOperations(activeOperations.task.id);
        setActiveOperations(updated);
      } catch (err) {
        console.error("Failed to stop workflow:", err);
      }
    } else if (activeWorkflowKind === "marketing" && activeCampaignId && marketingApi) {
      try {
        await marketingApi.cancelCampaign(activeCampaignId, "Canceled by Staff Operator");
        const detail = await marketingApi.getCampaign(activeCampaignId);
        setActiveCampaignDetail(detail);
      } catch (err) {
        console.error("Failed to cancel marketing campaign:", err);
      }
    }
  };

  // Helper to get branch status for operations
  const getBranchState = (department: string): "idle" | "running" | "completed" | "failed" => {
    if (activeWorkflowKind === "marketing") {
      const state = activeCampaignDetail?.campaign.state ?? "idle";
      if (department === "marketing_content") {
        if (state === "content_drafting") return "running";
        if (["visual_creation", "campaign_review", "awaiting_human_approval", "completed"].includes(state)) return "completed";
      }
      if (department === "marketing_visual") {
        if (state === "visual_creation") return "running";
        if (["campaign_review", "awaiting_human_approval", "completed"].includes(state)) return "completed";
      }
      if (department === "marketing_publisher") {
        if (state === "campaign_review" || state === "publishing") return "running";
        if (state === "completed" || state === "awaiting_human_approval") return "completed";
      }
      return "idle";
    }

    if (!activeOperations?.branches) return "idle";
    const branch = activeOperations.branches.find((b) => b.owner.toLowerCase().includes(department.toLowerCase()));
    if (!branch) return "idle";

    if (currentOrchestrationState === "canceled") return "idle";
    if (branch.state === "completed") return "completed";
    if (branch.state === "failed" || branch.state === "retry_exhausted") return "failed";

    if (isOrchestrationRunning && ["running", "in_progress", "pending"].includes(branch.state)) {
      return "running";
    }

    return "idle";
  };

  const activeCount = overview?.counts.running ?? (isRunning ? 1 : 0);

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

  const latestContent = activeCampaignDetail?.contentVersions?.[activeCampaignDetail.contentVersions.length - 1];
  const latestVisual = activeCampaignDetail?.visualAssets?.[activeCampaignDetail.visualAssets.length - 1];

  // Redesigned Subcomponent Data Mappings
  const isCurrentlyAnalyzing = isCeoThinking || isRunning;
  const analysisCurrentStep = isCeoThinking ? 2 : isRunning ? 3 : 1;

  const redesignedDepartmentCards: DepartmentCardProps[] = [
    {
      department: "marketing",
      displayName: "Tiếp thị & Sáng tạo",
      employeeCount: 3,
      activeTaskCount: departmentQueues.marketing.filter((t) => t.status === "running").length,
      status: activeCampaignDetail?.campaign.state === "campaign_review" ? "waiting_approval" : isRunning ? "running" : "idle",
      employees: [
        {
          id: "marketing_copywriter",
          name: "MKT-01",
          role: "Cây bút Tiếp thị",
          status: getBranchState("marketing_content") === "running" ? "working" : "idle",
          progressPercent: getBranchState("marketing_content") === "running" ? 75 : getBranchState("marketing_content") === "completed" ? 100 : 0,
        },
        {
          id: "marketing_visual",
          name: "MKT-02",
          role: "Thiết kế Đồ họa",
          status: getBranchState("marketing_visual") === "running" ? "working" : "idle",
          progressPercent: getBranchState("marketing_visual") === "running" ? 40 : getBranchState("marketing_visual") === "completed" ? 100 : 0,
        },
        {
          id: "marketing_publisher",
          name: "MKT-03",
          role: "Điều phối Xuất bản",
          status: getBranchState("marketing_publisher") === "running" ? "working" : "idle",
          progressPercent: getBranchState("marketing_publisher") === "completed" ? 100 : 0,
        },
      ],
      queue: departmentQueues.marketing,
      headerExtra: (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {socialTokensSummary && (() => {
            const hasExpiringOrInvalid = socialTokensSummary.hasExpiringOrInvalid;
            const urgent = socialTokensSummary.urgentActionRequired;
            const expiringAccount = socialTokensSummary.accounts.find(
              (a) => a.status === "expiring_soon" || a.status === "expired" || a.status === "invalid"
            );
            const days = expiringAccount?.daysRemaining;

            let badgeClass = "valid";
            let badgeText = "Social Token: OK";
            let icon = <ShieldCheck size={12} />;

            if (urgent || expiringAccount?.status === "expired" || expiringAccount?.status === "invalid") {
              badgeClass = "danger";
              badgeText = "🚨 Token FB lỗi / hết hạn";
              icon = <ShieldAlert size={12} />;
            } else if (hasExpiringOrInvalid || expiringAccount?.status === "expiring_soon") {
              badgeClass = "warning";
              const remainingLabel = expiringAccount?.expiresInHuman || (expiringAccount?.hoursRemaining ? `sau ${expiringAccount.hoursRemaining}h` : `sau ${days ?? 7} ngày`);
              badgeText = `⚡ Token FB hết hạn ${remainingLabel}`;
              icon = <Zap size={12} />;
            }

            return (
              <button
                type="button"
                className={`ccSocialTokenHeaderBadge ${badgeClass}`}
                onClick={() => setSocialTokenModalOpen(true)}
                title="Bấm để mở Trung tâm Quản lý Social Tokens"
                aria-label="Social Token Health Status"
              >
                {icon}
                <span>{badgeText}</span>
              </button>
            );
          })()}
          {departmentQueues.marketing.length > 0 && (
            <span className="ccDeptQueueBadge">
              <Clock size={11} className="ccSpinSlow" />
              <span>Hàng chờ: {departmentQueues.marketing.length}</span>
            </span>
          )}
        </div>
      ),
      alertBanner: socialTokensSummary && (socialTokensSummary.urgentActionRequired || socialTokensSummary.hasExpiringOrInvalid) && !dismissedSocialTokenAlerts ? (
        <div className="space-y-2 mb-2">
          {socialTokensSummary.accounts
            ?.filter((acc) => acc.requiresAction || acc.status === "expiring_soon" || acc.status === "expired" || acc.status === "invalid")
            .map((acc) => {
              const isDanger = acc.status === "expired" || acc.status === "invalid";
              const remainingText = acc.expiresInHuman || (acc.hoursRemaining ? `${acc.hoursRemaining} giờ` : `${acc.daysRemaining ?? 0} ngày`);
              const title = isDanger
                ? `🚨 Token Facebook đã hết hạn / lỗi`
                : `⚡ Token Facebook sắp hết hạn (${remainingText})`;

              return (
                <div key={`alert-${acc.platform}-${acc.accountId}`} className={`p-2.5 rounded-lg border text-xs ${isDanger ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300"}`} role={isDanger ? "alert" : undefined}>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold">{title}</span>
                    <span className="text-[10px] opacity-80">{acc.accountName || acc.accountId}</span>
                  </div>
                  {acc.lastError && <p className="text-[11px] opacity-90 mb-2">{acc.lastError}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {acc.actionType === "auto_refresh" ? (
                      <button
                        type="button"
                        className="px-2 py-1 bg-amber-500 text-black font-bold rounded text-xs hover:bg-amber-400 cursor-pointer"
                        onClick={() => handleRefreshSocialAccount(acc.platform, acc.accountId)}
                      >
                        Tự động Gia hạn ngay
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="px-2 py-1 bg-rose-500 text-white font-bold rounded text-xs hover:bg-rose-400 cursor-pointer"
                        onClick={() => handleOAuthReconnect(acc.platform)}
                      >
                        1-Click Kết nối lại
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ) : null,
      children: (
        <>
          <AgentCard
            name="Cây bút Sáng tạo"
            roleTag="SKILL"
            theme="blue"
            status={
              deptStatus.marketing.activeAgent === "marketing_copywriter" ||
              marketingActiveAgent === "marketing_copywriter"
                ? "running"
                : deptStatus.marketing.completedAgents.includes("marketing_copywriter") ||
                  activeCampaignDetail ||
                  marketingActiveAgent === "marketing_visual" ||
                  marketingActiveAgent === "marketing_publisher"
                ? "completed"
                : getBranchState("marketing_content")
            }
            statusText={
              deptStatus.marketing.activeAgent === "marketing_copywriter"
                ? deptStatus.marketing.agentMessage ?? "Cây bút Sáng tạo đang soạn nội dung bài viết và hashtag..."
                : marketingActiveAgent === "marketing_copywriter"
                ? marketingAgentMessage ?? "Cây bút Sáng tạo đang soạn nội dung bài viết và hashtag..."
                : deptStatus.marketing.completedAgents.includes("marketing_copywriter") ||
                  marketingActiveAgent === "marketing_visual" ||
                  marketingActiveAgent === "marketing_publisher"
                ? "Đã hoàn thành soạn thảo bài viết và bộ hashtag"
                : undefined
            }
            showProgress={
              deptStatus.marketing.activeAgent === "marketing_copywriter" ||
              marketingActiveAgent === "marketing_copywriter"
            }
            waitingTasksCount={getAgentWaitingTasksCount("marketing_copywriter")}
          />
          <AgentCard
            name="Thiết kế Đồ họa"
            roleTag="SKILL"
            theme="blue"
            isCollaborating={
              (activeCollaboration?.fromDept === "merchandising" && activeCollaboration.toDept === "marketing") ||
              (activeCollaboration?.fromDept === "marketing" && activeCollaboration.toDept === "merchandising") ||
              marketingActiveAgent === "merchandising_visual_collab"
            }
            collabTag="Phối hợp cùng Danh mục"
            status={
              deptStatus.marketing.activeAgent === "marketing_visual" ||
              marketingActiveAgent === "marketing_visual" ||
              marketingActiveAgent === "merchandising_visual_collab"
                ? "running"
                : deptStatus.marketing.completedAgents.includes("marketing_visual") ||
                  (activeCampaignDetail && (activeCampaignDetail.visualAssets.length > 0 || activeCampaignDetail.artifacts.length > 0)) ||
                  marketingActiveAgent === "marketing_publisher"
                ? "completed"
                : getBranchState("marketing_visual")
            }
            statusText={
              deptStatus.marketing.activeAgent === "marketing_visual"
                ? deptStatus.marketing.agentMessage ?? "Thiết kế Đồ họa đang dựng poster và banner..."
                : marketingActiveAgent === "marketing_visual"
                ? marketingAgentMessage ?? "Thiết kế Đồ họa đang dựng poster và banner..."
                : marketingActiveAgent === "merchandising_visual_collab"
                ? marketingAgentMessage ?? "Đang phối hợp vẽ poster ưu đãi & badge 3D..."
                : deptStatus.marketing.completedAgents.includes("marketing_visual") ||
                  (activeCampaignDetail && (activeCampaignDetail.visualAssets.length > 0 || activeCampaignDetail.artifacts.length > 0)) ||
                  marketingActiveAgent === "marketing_publisher"
                ? "Đã hoàn thành thiết kế poster & banner chiến dịch"
                : undefined
            }
            showProgress={
              deptStatus.marketing.activeAgent === "marketing_visual" ||
              marketingActiveAgent === "marketing_visual" ||
              marketingActiveAgent === "merchandising_visual_collab"
            }
            waitingTasksCount={getAgentWaitingTasksCount("marketing_visual")}
          />
          <AgentCard
            name="Điều phối Đăng bài"
            roleTag="DEPLOY"
            theme="blue"
            status={
              deptStatus.marketing.activeAgent === "marketing_publisher" ||
              marketingActiveAgent === "marketing_publisher"
                ? "running"
                : deptStatus.marketing.completedAgents.includes("marketing_publisher") ||
                  activeCampaignDetail?.campaign.state === "completed"
                ? "completed"
                : activeCampaignDetail?.campaign.state === "failed" ||
                  activeCampaignDetail?.campaign.state === "partial_failure"
                ? "failed"
                : getBranchState("marketing_publisher")
            }
            statusText={
              deptStatus.marketing.activeAgent === "marketing_publisher"
                ? deptStatus.marketing.agentMessage ?? "Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage..."
                : marketingActiveAgent === "marketing_publisher"
                ? marketingAgentMessage ?? "Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage..."
                : deptStatus.marketing.completedAgents.includes("marketing_publisher") ||
                  activeCampaignDetail?.campaign.state === "completed"
                ? "Đã hoàn tất đăng bài lên Fanpage thành công"
                : undefined
            }
            showProgress={
              deptStatus.marketing.activeAgent === "marketing_publisher" ||
              marketingActiveAgent === "marketing_publisher"
            }
            waitingTasksCount={getAgentWaitingTasksCount("marketing_publisher")}
          />
          {departmentQueues.marketing.map((task) => (
            <div key={task.id} className="ccDepartmentWaitingCard">
              <div className="ccWaitingCardHeader">
                <div className="ccWaitingCardTitle">
                  <Clock size={12} className="ccSpinSlow" />
                  <span>Nhiệm vụ đang xếp hàng</span>
                </div>
                <button
                  type="button"
                  className="ccWaitingCancelBtn"
                  onClick={() => handleCancelQueuedTask(task.id, "marketing")}
                  title="Hủy nhiệm vụ khỏi hàng chờ"
                >
                  <X size={11} />
                  <span>Hủy</span>
                </button>
              </div>
              <p className="ccWaitingCardPrompt">{`"${task.prompt}"`}</p>
              <div className="ccWaitingCardResource">
                <span className="ccWaitingDot" />
                <span>
                  Đang đợi {task.waitingForResource?.agentName || "nhân sự phối hợp"} hoàn tất việc...
                </span>
              </div>
            </div>
          ))}
        </>
      ),
      directInputPlaceholder: "Giao việc cho Tiếp thị & Sáng tạo...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("marketing", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => setSocialTokenModalOpen(true),
    },
    {
      department: "merchandising",
      displayName: "Danh mục & Định giá",
      employeeCount: 2,
      activeTaskCount: departmentQueues.merchandising.filter((t) => t.status === "running").length,
      status: activeCampaign ? "running" : "idle",
      employees: [
        {
          id: "catalog_copywriter",
          name: "CAT-01",
          role: "Cây bút Sản phẩm",
          status: "working",
          progressPercent: 60,
        },
        {
          id: "pricing_strategist",
          name: "CAT-02",
          role: "Chuyên viên Định giá",
          status: "idle",
          progressPercent: 0,
        },
      ],
      queue: departmentQueues.merchandising,
      headerExtra: departmentQueues.merchandising.length > 0 ? (
        <span className="ccDeptQueueBadge">
          <Clock size={11} className="ccSpinSlow" />
          <span>Hàng chờ: {departmentQueues.merchandising.length}</span>
        </span>
      ) : null,
      children: (
        <>
          <AgentCard
            name="Cây bút Sản phẩm"
            roleTag="SKILL"
            theme="cyan"
            status={
              deptStatus.merchandising.activeAgent === "catalog_copywriter" ||
              marketingActiveAgent === "catalog_copywriter"
                ? "running"
                : deptStatus.merchandising.completedAgents.includes("catalog_copywriter") ||
                  marketingActiveAgent === "pricing_strategist" ||
                  marketingActiveAgent === "merchandising_visual_collab" ||
                  campaignProposal
                ? "completed"
                : getBranchState("catalog")
            }
            statusText={
              deptStatus.merchandising.activeAgent === "catalog_copywriter"
                ? deptStatus.merchandising.agentMessage ?? "Cây bút Sản phẩm đang tối ưu tiêu đề SEO..."
                : marketingActiveAgent === "catalog_copywriter"
                ? marketingAgentMessage ?? "Cây bút Sản phẩm đang tối ưu tiêu đề SEO..."
                : deptStatus.merchandising.completedAgents.includes("catalog_copywriter") ||
                  marketingActiveAgent === "pricing_strategist" ||
                  marketingActiveAgent === "merchandising_visual_collab" ||
                  campaignProposal
                ? "Đã hoàn tất tối ưu tên & mô tả SEO"
                : undefined
            }
            showProgress={
              deptStatus.merchandising.activeAgent === "catalog_copywriter" ||
              marketingActiveAgent === "catalog_copywriter"
            }
            waitingTasksCount={getAgentWaitingTasksCount("catalog_copywriter")}
          />
          <AgentCard
            name="Chuyên gia Định giá"
            roleTag="SKILL"
            theme="cyan"
            status={
              deptStatus.merchandising.activeAgent === "pricing_strategist" ||
              marketingActiveAgent === "pricing_strategist"
                ? "running"
                : deptStatus.merchandising.completedAgents.includes("pricing_strategist") ||
                  campaignProposal
                ? "completed"
                : getBranchState("pricing")
            }
            statusText={
              deptStatus.merchandising.activeAgent === "pricing_strategist"
                ? deptStatus.merchandising.agentMessage ?? "Chuyên gia Định giá đang phân tích biên lợi nhuận..."
                : marketingActiveAgent === "pricing_strategist"
                ? marketingAgentMessage ?? "Chuyên gia Định giá đang phân tích biên lợi nhuận..."
                : deptStatus.merchandising.completedAgents.includes("pricing_strategist") ||
                  campaignProposal
                ? "Đã hoàn thành phân tích biên lợi nhuận & lập đề xuất Flash Sale"
                : undefined
            }
            showProgress={
              deptStatus.merchandising.activeAgent === "pricing_strategist" ||
              marketingActiveAgent === "pricing_strategist"
            }
            waitingTasksCount={getAgentWaitingTasksCount("pricing_strategist")}
          />
          {pendingHandoff?.dept === "merchandising" && (
            <div className="ccDepartmentWaitingCard" style={{ borderColor: "rgba(6, 182, 212, 0.45)", background: "rgba(6, 182, 212, 0.08)" }}>
              <div className="ccWaitingCardHeader">
                <div className="ccWaitingCardTitle" style={{ color: "#22d3ee" }}>
                  <Clock size={12} className="ccSpinSlow" />
                  <span>Chờ bàn giao liên phòng</span>
                </div>
                <button
                  type="button"
                  className="ccWaitingCancelBtn"
                  onClick={() => handleCancelPendingHandoff("merchandising")}
                  title="Hủy bàn giao nhiệm vụ"
                >
                  <X size={11} />
                  <span>Hủy</span>
                </button>
              </div>
              <p className="ccWaitingCardPrompt">{`"${pendingHandoff.prompt}"`}</p>
              <div className="ccWaitingCardResource">
                <span className="ccWaitingDot" style={{ background: "#22d3ee" }} />
                <span>
                  Đã xong bước 1. Đang đợi {DIGITAL_EMPLOYEES[pendingHandoff.waitingForAgent]?.name || "nhân sự phối hợp"} ({pendingHandoff.waitingForDept === "marketing" ? "Phòng Tiếp thị" : "Phòng khác"}) hoàn tất việc...
                </span>
              </div>
            </div>
          )}
          {departmentQueues.merchandising.map((task) => (
            <div key={task.id} className="ccDepartmentWaitingCard">
              <div className="ccWaitingCardHeader">
                <div className="ccWaitingCardTitle">
                  <Clock size={12} className="ccSpinSlow" />
                  <span>Nhiệm vụ đang xếp hàng</span>
                </div>
                <button
                  type="button"
                  className="ccWaitingCancelBtn"
                  onClick={() => handleCancelQueuedTask(task.id, "merchandising")}
                  title="Hủy nhiệm vụ khỏi hàng chờ"
                >
                  <X size={11} />
                  <span>Hủy</span>
                </button>
              </div>
              <p className="ccWaitingCardPrompt">{`"${task.prompt}"`}</p>
              <div className="ccWaitingCardResource">
                <span className="ccWaitingDot" />
                <span>
                  Đang đợi {task.waitingForResource?.agentName || "nhân sự phối hợp"} hoàn tất việc...
                </span>
              </div>
            </div>
          ))}
        </>
      ),
      directInputPlaceholder: "Giao việc cho Danh mục & Định giá...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("merchandising", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => {
        if (activeCampaign) {
          setCampaignProposalModalOpen(true);
        }
      },
    },
    {
      department: "operations",
      displayName: "Vận hành & Kho vận",
      employeeCount: 2,
      activeTaskCount: departmentQueues.operations.filter((t) => t.status === "running").length,
      status: pendingReplenishment ? "waiting_approval" : errorMessage ? "error" : "idle",
      errorMessage: pendingReplenishment
        ? undefined
        : errorMessage || undefined,
      employees: [
        {
          id: "inventory_specialist",
          name: "OPS-01",
          role: "Kỹ sư Tồn kho",
          status: pendingReplenishment ? "waiting" : "working",
          progressPercent: 0,
        },
        {
          id: "order_coordinator",
          name: "OPS-02",
          role: "Điều phối Đơn hàng",
          status: "working",
          progressPercent: 30,
        },
      ],
      queue: departmentQueues.operations,
      headerExtra: (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {pendingReplenishment && pendingReplenishment.items.length > 0 && (
            <span className="ccReplenishmentAlertBadge" title="Đề xuất nhập kho tự động từ AI">
              {`⚡ Đề xuất nhập kho AI: ${pendingReplenishment.items.length} SKU`}
            </span>
          )}
          {departmentQueues.operations.length > 0 && (
            <span className="ccDeptQueueBadge">
              <Clock size={11} className="ccSpinSlow" />
              <span>{`Hàng chờ: ${departmentQueues.operations.length}`}</span>
            </span>
          )}
        </div>
      ),
      alertBanner: pendingReplenishment ? (
        <div className="ccOperationsAlertCard mb-2">
          <div className="ccOperationsAlertHeader">
            <AlertTriangle size={15} color="#f59e0b" className="ccGlowIcon" />
            <span className="ccOperationsAlertTitle">
              {`🚨 Phát hiện ${pendingReplenishment.items.length} mặt hàng sắp cạn kiệt`}
            </span>
          </div>
          <p className="ccOperationsAlertSummary">
            {pendingReplenishment.summary || "Tồn kho một số mặt hàng chủ lực đang cạn kiệt nhanh do sức mua tăng cao."}
          </p>
          <div className="ccOperationsAlertActions">
            <button
              type="button"
              className="ccOperationsAlertBtn primary"
              onClick={() => {
                setOperationsProposal(pendingReplenishment);
                setIsOperationsModalOpen(true);
              }}
            >
              <Boxes size={13} />
              <span>📋 Xem & Duyệt Nhập hàng</span>
            </button>
            <button
              type="button"
              className="ccOperationsAlertBtn secondary"
              onClick={handleDismissReplenishment}
            >
              Bỏ qua
            </button>
          </div>
        </div>
      ) : null,
      children: (
        <>
          <AgentCard
            name="Kỹ sư Tồn kho"
            roleTag="SKILL"
            theme="amber"
            isCollaborating={
              (activeCollaboration?.fromDept === "operations" && activeCollaboration.toDept === "merchandising") ||
              marketingActiveAgent === "inventory_clearance_handoff"
            }
            collabTag="Bàn giao liên phòng"
            status={
              deptStatus.operations.activeAgent === "inventory_specialist" ||
              marketingActiveAgent === "inventory_specialist" ||
              marketingActiveAgent === "inventory_clearance_handoff"
                ? "running"
                : deptStatus.operations.completedAgents.includes("inventory_specialist") ||
                  marketingActiveAgent === "order_coordinator" ||
                  operationsProposal ||
                  marketingActiveAgent === "merchandising_clearance_calc" ||
                  marketingActiveAgent === "merchandising_visual_collab" ||
                  campaignProposal
                ? "completed"
                : getBranchState("inventory")
            }
            statusText={
              deptStatus.operations.activeAgent === "inventory_specialist"
                ? deptStatus.operations.agentMessage ?? "Đang rà soát mức tồn kho thực tế và lượng giữ chỗ..."
                : marketingActiveAgent === "inventory_clearance_handoff"
                ? marketingAgentMessage ?? "Đang rà soát đối soát SKU tồn đọng để bàn giao sang Phòng Danh mục..."
                : marketingActiveAgent === "inventory_specialist"
                ? marketingAgentMessage ?? "Đang rà soát mức tồn kho thực tế và lượng giữ chỗ..."
                : deptStatus.operations.completedAgents.includes("inventory_specialist") ||
                  operationsProposal ||
                  marketingActiveAgent === "merchandising_clearance_calc" ||
                  marketingActiveAgent === "merchandising_visual_collab" ||
                  campaignProposal
                ? "Đã kiểm toán dữ liệu SKU và phân loại rủi ro tồn kho"
                : undefined
            }
            showProgress={
              deptStatus.operations.activeAgent === "inventory_specialist" ||
              marketingActiveAgent === "inventory_specialist" ||
              marketingActiveAgent === "inventory_clearance_handoff"
            }
            waitingTasksCount={getAgentWaitingTasksCount("inventory_specialist")}
          />
          <AgentCard
            name="Điều phối Đơn hàng"
            roleTag="SKILL"
            theme="amber"
            status={
              deptStatus.operations.activeAgent === "order_coordinator" ||
              marketingActiveAgent === "order_coordinator"
                ? "running"
                : deptStatus.operations.completedAgents.includes("order_coordinator") ||
                  operationsProposal
                ? "completed"
                : getBranchState("fulfillment")
            }
            statusText={
              deptStatus.operations.activeAgent === "order_coordinator"
                ? deptStatus.operations.agentMessage ?? "Đang tính toán tốc độ luân chuyển và lập báo cáo kiểm toán..."
                : marketingActiveAgent === "order_coordinator"
                ? marketingAgentMessage ?? "Đang tính toán tốc độ luân chuyển và lập báo cáo kiểm toán..."
                : deptStatus.operations.completedAgents.includes("order_coordinator") ||
                  operationsProposal
                ? "Đã hoàn thành lập dự toán ngân sách và xuất báo cáo kiểm toán Word"
                : undefined
            }
            showProgress={
              deptStatus.operations.activeAgent === "order_coordinator" ||
              marketingActiveAgent === "order_coordinator"
            }
            waitingTasksCount={getAgentWaitingTasksCount("order_coordinator")}
          />
          {departmentQueues.operations.map((task) => (
            <div key={task.id} className="ccDepartmentWaitingCard">
              <div className="ccWaitingCardHeader">
                <div className="ccWaitingCardTitle">
                  <Clock size={12} className="ccSpinSlow" />
                  <span>Nhiệm vụ đang xếp hàng</span>
                </div>
                <button
                  type="button"
                  className="ccWaitingCancelBtn"
                  onClick={() => handleCancelQueuedTask(task.id, "operations")}
                  title="Hủy nhiệm vụ khỏi hàng chờ"
                >
                  <X size={11} />
                  <span>Hủy</span>
                </button>
              </div>
              <p className="ccWaitingCardPrompt">{`"${task.prompt}"`}</p>
              <div className="ccWaitingCardResource">
                <span className="ccWaitingDot" />
                <span>
                  Đang đợi {task.waitingForResource?.agentName || "nhân sự phối hợp"} hoàn tất việc...
                </span>
              </div>
            </div>
          ))}
          {operationsProposal && (
            <button
              type="button"
              className="ccOperationsQuickBtn"
              style={{ marginTop: "0.25rem", width: "100%", justifyContent: "center", padding: "0.45rem 0.6rem" }}
              onClick={() => setIsOperationsModalOpen(true)}
            >
              <Boxes size={14} color="#fbbf24" />
              <span>Xem Phiếu Đề Xuất ({operationsProposal.totalRestockUnits} đơn vị)</span>
            </button>
          )}
        </>
      ),
      directInputPlaceholder: "Giao việc cho Vận hành & Kho...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("operations", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => {
        if (pendingReplenishment) {
          setOperationsProposal(pendingReplenishment);
          setIsOperationsModalOpen(true);
        }
      },
      onErrorResolve: () => {
        if (pendingReplenishment) {
          setOperationsProposal(pendingReplenishment);
          setIsOperationsModalOpen(true);
        }
      },
    },
    {
      department: "support",
      displayName: "CSKH & Trải nghiệm",
      employeeCount: 2,
      activeTaskCount: departmentQueues.support.filter((t) => t.status === "running").length,
      status: departmentQueues.support.some((t) => t.status === "running") ? "running" : "idle",
      employees: [
        {
          id: "support_steward",
          name: "SUP-01",
          role: "Quản gia CSKH",
          status: "working",
          progressPercent: 90,
        },
        {
          id: "crm_specialist",
          name: "SUP-02",
          role: "Chuyên viên CRM",
          status: "idle",
          progressPercent: 0,
        },
      ],
      queue: departmentQueues.support,
      headerExtra: departmentQueues.support.length > 0 ? (
        <span className="ccDeptQueueBadge">
          <Clock size={11} className="ccSpinSlow" />
          <span>Hàng chờ: {departmentQueues.support.length}</span>
        </span>
      ) : null,
      children: (
        <>
          <AgentCard
            name="Quản gia CSKH"
            roleTag="SKILL"
            theme="emerald"
            status={
              deptStatus.support.activeAgent === "support_steward" ||
              marketingActiveAgent === "support_steward"
                ? "running"
                : deptStatus.support.completedAgents.includes("support_steward") ||
                  marketingActiveAgent === "crm_specialist" ||
                  supportProposal
                ? "completed"
                : "idle"
            }
            statusText={
              deptStatus.support.activeAgent === "support_steward"
                ? deptStatus.support.agentMessage ?? "Đang rà soát khiếu nại khách hàng & phân loại CSAT..."
                : marketingActiveAgent === "support_steward"
                ? marketingAgentMessage ?? "Đang rà soát khiếu nại khách hàng & phân loại CSAT..."
                : deptStatus.support.completedAgents.includes("support_steward") ||
                  marketingActiveAgent === "crm_specialist" ||
                  supportProposal
                ? "Đã phân tích toàn bộ khiếu nại & tính toán CSAT"
                : undefined
            }
            showProgress={
              deptStatus.support.activeAgent === "support_steward" ||
              marketingActiveAgent === "support_steward"
            }
            waitingTasksCount={getAgentWaitingTasksCount("support_steward")}
          />
          <AgentCard
            name="Chuyên viên CRM"
            roleTag="SKILL"
            theme="emerald"
            status={
              deptStatus.support.activeAgent === "crm_specialist" ||
              marketingActiveAgent === "crm_specialist"
                ? "running"
                : deptStatus.support.completedAgents.includes("crm_specialist") ||
                  supportProposal
                ? "completed"
                : "idle"
            }
            statusText={
              deptStatus.support.activeAgent === "crm_specialist"
                ? deptStatus.support.agentMessage ?? "Đang phân khúc nhóm khách hàng VIP & đề xuất voucher..."
                : marketingActiveAgent === "crm_specialist"
                ? marketingAgentMessage ?? "Đang phân khúc nhóm khách hàng VIP & đề xuất voucher..."
                : deptStatus.support.completedAgents.includes("crm_specialist") ||
                  supportProposal
                ? "Đã lập kịch bản chăm sóc & đề xuất voucher cho khách VIP"
                : undefined
            }
            showProgress={
              deptStatus.support.activeAgent === "crm_specialist" ||
              marketingActiveAgent === "crm_specialist"
            }
            waitingTasksCount={getAgentWaitingTasksCount("crm_specialist")}
          />
          {departmentQueues.support.map((task) => (
            <div key={task.id} className="ccDepartmentWaitingCard">
              <div className="ccWaitingCardHeader">
                <div className="ccWaitingCardTitle">
                  <Clock size={12} className="ccSpinSlow" />
                  <span>Nhiệm vụ đang xếp hàng</span>
                </div>
                <button
                  type="button"
                  className="ccWaitingCancelBtn"
                  onClick={() => handleCancelQueuedTask(task.id, "support")}
                  title="Hủy nhiệm vụ khỏi hàng chờ"
                >
                  <X size={11} />
                  <span>Hủy</span>
                </button>
              </div>
              <p className="ccWaitingCardPrompt">{`"${task.prompt}"`}</p>
              <div className="ccWaitingCardResource">
                <span className="ccWaitingDot" />
                <span>
                  Đang đợi {task.waitingForResource?.agentName || "nhân sự phối hợp"} hoàn tất việc...
                </span>
              </div>
            </div>
          ))}
          {supportProposal && (
            <button
              type="button"
              className="ccOperationsQuickBtn"
              style={{ marginTop: "0.25rem", width: "100%", justifyContent: "center", padding: "0.45rem 0.6rem", borderColor: "rgba(16, 185, 129, 0.4)", color: "#34d399" }}
              onClick={handleDownloadSupportDocx}
            >
              <FileText size={14} color="#10b981" />
              <span>Tải Báo Cáo CSKH Word ({supportProposal.tickets.length} Ticket)</span>
            </button>
          )}
        </>
      ),
      directInputPlaceholder: "Giao việc cho CSKH & CRM...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("support", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => {},
    },
  ];

  const redesignedApprovals: PendingApprovalItem[] = [];

  if (pendingReplenishment) {
    redesignedApprovals.push({
      id: pendingReplenishment.id,
      title: `Kế hoạch nhập kho tự động: ${pendingReplenishment.items.length} SKU`,
      sourceDepartment: "operations",
      authorName: "Kỹ sư Tồn kho (OPS-01)",
      riskLevel: "medium",
      timestamp: new Date(pendingReplenishment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      onPreview: () => {
        setOperationsProposal(pendingReplenishment);
        setIsOperationsModalOpen(true);
      },
      onRequestRevision: () => {},
      onApprove: () => {
        setOperationsProposal(pendingReplenishment);
        setIsOperationsModalOpen(true);
      },
    });
  }

  if (activeCampaignDetail?.campaign.state === "campaign_review") {
    redesignedApprovals.push({
      id: activeCampaignDetail.campaign.id,
      title: activeCampaignDetail.campaign.campaignName || "Chiến dịch Marketing Fanpage",
      sourceDepartment: "marketing",
      authorName: "Tiếp thị & Sáng tạo (MKT-01)",
      riskLevel: "medium",
      timestamp: "14:26",
      onPreview: () => setSocialTokenModalOpen(true),
      onRequestRevision: () => {},
      onApprove: () => void handleApproveMarketing(),
    });
  }

  const redesignedLiveEvents: LiveEventItem[] = [
    {
      id: "ev-ceo-plan",
      timestamp: "14:26",
      department: "ai_ceo",
      title: "AI CEO đã phân tích yêu cầu",
      description: "Đã tạo kế hoạch và phân bổ cho 4 phòng ban phối hợp thực thi",
      status: "success",
    },
    {
      id: "ev-mkt-run",
      timestamp: "14:26",
      department: "marketing",
      title: "Marketing bắt đầu thực thi",
      description: "MKT-01 đang lập kế hoạch và soạn thảo nội dung",
      status: "info",
    },
    ...(pendingReplenishment
      ? [
          {
            id: "ev-ops-alert",
            timestamp: "14:27",
            department: "operations" as const,
            title: "Vận hành báo cảnh báo tồn kho",
            description: `Ghi nhận ${pendingReplenishment.items.length} SKU dưới ngưỡng an toàn, đề xuất bổ sung kho`,
            status: "warning" as const,
            actionLabel: "Cần xử lý",
            onActionClick: () => {
              setOperationsProposal(pendingReplenishment);
              setIsOperationsModalOpen(true);
            },
          },
        ]
      : []),
    {
      id: "ev-pricing-draft",
      timestamp: "14:27",
      department: "merchandising",
      title: "Định giá hoàn thành dự thảo",
      description: "Đã có bản đề xuất mức giá khuyến mãi sơ bộ",
      status: "success",
    },
  ];

  const redesignedRecentDeliverables = [
    {
      id: "deliv-1",
      title: "Báo cáo xu hướng thị trường mỹ phẩm SEA",
      departmentName: "Tiếp thị & Sáng tạo",
      completedAt: "14:20",
      format: "docx",
      onDownloadOrView: () => setRecentOutcomesOpen((prev) => !prev),
    },
    {
      id: "deliv-2",
      title: "Danh sách 500 khách hàng tiềm năng",
      departmentName: "CSKH & CRM",
      completedAt: "13:45",
      format: "xlsx",
      onDownloadOrView: () => setRecentOutcomesOpen((prev) => !prev),
    },
    {
      id: "deliv-3",
      title: "Kế hoạch Flash Sale Q2/2026",
      departmentName: "Danh mục & Định giá",
      completedAt: "12:30",
      format: "pdf",
      onDownloadOrView: () => setRecentOutcomesOpen((prev) => !prev),
    },
  ];

  return (
    <section className="commandCenterWorkspace">
      {/* Expired Session or Error Alert */}
      {errorMessage && (
        <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: 8, padding: "0.75rem 1rem", color: "#fca5a5", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={16} />
            <span>{errorMessage === "Authentication required" ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục." : errorMessage}</span>
          </div>
          {(errorMessage.includes("Authentication") || errorMessage.includes("401") || errorMessage.includes("Unauthorized")) && (
            <button
              type="button"
              onClick={() => void signIn()}
              style={{ background: "#f59e0b", color: "#000", border: "none", borderRadius: 6, padding: "0.3rem 0.8rem", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
            >
              Đăng nhập lại
            </button>
          )}
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: 8, padding: "0.75rem 1rem", color: "#6ee7b7", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* TIER 1: Command Center Header Bar */}
      <CommandCenterHeader
        activeFilter={taskFilter}
        onFilterChange={setTaskFilter}
        counts={{
          all: (overview?.counts.running ?? 0) + (overview?.counts.waiting ?? 0) + (overview?.counts.completed ?? 0) + (overview?.counts.failed ?? 0),
          running: overview?.counts.running ?? activeCount,
          waiting_approval: overview?.counts.waiting ?? redesignedApprovals.length,
          completed: overview?.counts.completed ?? 28,
          failed: overview?.counts.failed ?? 0,
        }}
        onNewTaskClick={() => handleSendStrategicTask()}
        onDirectModeToggle={() => setDirectInputMode((prev) => !prev)}
        directInputMode={directInputMode}
      />

      {/* TIER 1: Command Composer Panel & AI CEO Stepper */}
      <CommandComposerPanel
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={() => handleSendStrategicTask()}
        isSubmitting={isSubmitting}
        isAnalyzing={isCurrentlyAnalyzing}
        analysisStep={analysisCurrentStep}
        analysisDurationSeconds={28}
        priority={composerPriority}
        onPriorityChange={setComposerPriority}
        targetDepartment={composerTarget}
        onTargetDepartmentChange={setComposerTarget}
        onSelectTemplate={(tmpl) => {
          setPrompt(tmpl.prompt);
          handleSendStrategicTask(tmpl.prompt);
        }}
      />

      {/* TIER 2: 2x2 Workforce Grid (Left 70%) & Live Activity + Approvals (Right 30%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 my-6">
        <div className="xl:col-span-8">
          <WorkforceGrid
            departments={redesignedDepartmentCards}
            onViewDagGraph={() => {
              if (activeTaskId) {
                navigate(`/agentic/tasks/${activeTaskId}`);
              } else {
                navigate("/agentic/tasks-table");
              }
            }}
            containerRef={departmentsGridRef}
          >
            <CrossDepartmentConnector
              activeCollaboration={activeCollaboration}
              containerRef={departmentsGridRef}
            />
          </WorkforceGrid>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6">
          <LiveActivityFeed
            events={redesignedLiveEvents}
            activeDepartmentFilter={liveFeedFilter}
            onFilterChange={setLiveFeedFilter}
          />
          <PendingApprovalsPanel
            approvals={redesignedApprovals}
            onViewAll={() => navigate("/agentic/approvals")}
          />
        </div>
      </div>

      {/* TIER 3: Results & Performance Dashboard */}
      <ResultsMetricsPanel
        totalCompleted={overview?.counts.completed ?? 28}
        onTimePercent={82}
        delayedPercent={11}
        cancelledPercent={7}
        departmentEfficiencies={[
          { department: "marketing", displayName: "Tiếp thị & Sáng tạo", efficiencyPercent: 92 },
          { department: "merchandising", displayName: "Danh mục & Định giá", efficiencyPercent: 78 },
          { department: "operations", displayName: "Vận hành & Kho vận", efficiencyPercent: 65 },
          { department: "support", displayName: "CSKH & CRM", efficiencyPercent: 88 },
        ]}
        activeTasksCount={overview?.counts.running ?? activeCount}
        completedThisWeekCount={overview?.counts.completed ?? 28}
        completedTrendPercent={27}
        avgDurationHours={3.2}
        durationTrendPercent={-41}
        approvalRatePercent={96}
        approvalRateTrendPercent={12}
        recentDeliverables={redesignedRecentDeliverables}
        onViewAllDeliverables={() => navigate("/agentic/tasks-table")}
      />

      {/* Production Modals */}
      {campaignProposalModalOpen && campaignProposal && (
        <CampaignProposalModal
          proposal={campaignProposal}
          onClose={() => setCampaignProposalModalOpen(false)}
          onApprove={handleApproveCampaign}
          isActivating={isActivatingCampaign}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {operationsProposal && (
        <OperationsProposalModal
          isOpen={isOperationsModalOpen}
          proposal={operationsProposal}
          onClose={() => setIsOperationsModalOpen(false)}
          onApply={handleApplyOperations}
          onDownloadDocx={handleDownloadOperationsDocx}
          onTriggerClearanceCampaign={handleTriggerClearanceCampaign}
          isApplying={operationsActionLoading}
          isDownloadingDocx={isDownloadingDocx}
        />
      )}

      <SocialTokenManagerModal
        isOpen={socialTokenModalOpen}
        onClose={() => setSocialTokenModalOpen(false)}
        summary={socialTokensSummary}
        onRefreshAccount={handleRefreshSocialAccount}
        onCheckTokens={handleCheckSocialTokens}
        onUpdateToken={handleUpdateSocialToken}
        onSyncEnv={handleSyncSocialTokensEnv}
        onOAuthReconnect={handleOAuthReconnect}
        onConfigureMetaApp={handleConfigureMetaApp}
        isActionLoading={socialTokenActionLoading}
        actionFeedback={socialTokenFeedback}
      />
    </section>
  );
}

interface DepartmentInputProps {
  readonly placeholder: string;
  readonly theme: "blue" | "cyan" | "amber" | "emerald" | "purple";
  readonly disabled?: boolean;
  readonly onSend: (input: string) => void | Promise<void>;
}

function DepartmentInput({ placeholder, theme, disabled, onSend }: DepartmentInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    const text = input;
    setInput("");
    void onSend(text);
  };

  return (
    <form className={`ccDeptInputWrapper theme-${theme}`} onSubmit={handleSubmit}>
      <input
        type="text"
        className="ccDeptInput"
        placeholder={placeholder}
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
      />
      <button
        type="submit"
        className={`ccDeptSendBtn theme-${theme}`}
        title="Giao việc cho phòng ban"
        disabled={disabled || !input.trim()}
      >
        <Send size={14} />
      </button>
    </form>
  );
}

interface AgentCardProps {
  readonly name: string;
  readonly roleTag: string;
  readonly status: "idle" | "running" | "completed" | "failed";
  readonly statusText?: string;
  readonly showProgress?: boolean;
  readonly theme?: "blue" | "cyan" | "amber" | "emerald" | "purple";
  readonly isCollaborating?: boolean;
  readonly collabTag?: string;
  readonly waitingTasksCount?: number;
}

function AgentCard({
  name,
  roleTag,
  status,
  statusText,
  showProgress,
  theme = "blue",
  isCollaborating = false,
  collabTag,
  waitingTasksCount,
}: AgentCardProps) {
  const isRunning = status === "running";

  return (
    <div
      className={`ccAgentCard ${isRunning ? "activeThinking" : ""} ${
        isRunning ? `activeBorder-${theme}` : ""
      } ${isCollaborating && isRunning ? "ccAgentCollaborating" : ""}`}
    >
      <div className="ccAgentCardHeader">
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span className="ccAgentRoleBadge">{roleTag}</span>
          {isCollaborating && (
            <span className="ccCollabPill">
              ⚡ {collabTag || "Phối hợp liên phòng"}
            </span>
          )}
        </div>
        {isRunning ? (
          <span className="ccStatusIndicatorIcon" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span className={`ccStatusIndicatorDot running ${theme}`} />
          </span>
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
        <p className={`ccAgentContentText ${isRunning ? "activeCalc" : ""}`}>
          {statusText}
        </p>
      )}

      {waitingTasksCount !== undefined && waitingTasksCount > 0 && (
        <div className="ccAgentQueueNotice" title="Nhiệm vụ đang xếp hàng chờ tài nguyên này">
          <Clock size={11} />
          <span>{waitingTasksCount} nhiệm vụ đang chờ nhân sự này</span>
        </div>
      )}

      {(showProgress || isRunning) && (
        <div className={`ccProgressBarContainer theme-${theme}`}>
          <div className="ccProgressBarFill" />
        </div>
      )}
    </div>
  );
}

interface ProposalPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemName: string;
  onPageChange: (page: number) => void;
}

function ProposalPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  itemName,
  onPageChange,
}: ProposalPaginationProps) {
  if (totalItems <= pageSize) return null;

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="ccProposalPagination">
      <div className="ccProposalPaginationInfo">
        Hiển thị <strong>{startIdx}–{endIdx}</strong> / <strong>{totalItems}</strong> {itemName}
      </div>
      <div className="ccProposalPaginationActions">
        <button
          type="button"
          className="ccProposalPaginationBtn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Trang trước"
        >
          ◀ Trước
        </button>
        <div className="ccProposalPaginationPages">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`ccProposalPaginationPageNum ${p === currentPage ? "active" : ""}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ccProposalPaginationBtn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Trang sau"
        >
          Sau ▶
        </button>
      </div>
    </div>
  );
}

function CompactProposedResponse({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 140;

  return (
    <div>
      <div className={`ccProposalResponseText ${isLong && !expanded ? "clamped" : ""}`}>
        {text}
      </div>
      {isLong && (
        <button
          type="button"
          className="ccProposalExpandToggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Thu gọn ▲" : "Xem toàn bộ kịch bản ▼"}
        </button>
      )}
    </div>
  );
}

interface CrossDepartmentConnectorProps {
  readonly activeCollaboration: ActiveCollaboration | null;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
}

export function CrossDepartmentConnector({
  activeCollaboration,
  containerRef,
}: CrossDepartmentConnectorProps) {
  const [coords, setCoords] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    cx1: number;
    cy1: number;
    cx2: number;
    cy2: number;
    midX: number;
    midY: number;
    d: string;
  } | null>(null);

  useEffect(() => {
    if (!activeCollaboration) {
      setCoords(null);
      return;
    }

    const calculateCoords = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const fromEl = document.getElementById(`dept-column-${activeCollaboration.fromDept}`);
      const toEl = document.getElementById(`dept-column-${activeCollaboration.toDept}`);

      const deptIndexMap: Record<DepartmentType, number> = {
        marketing: 0,
        merchandising: 1,
        operations: 2,
        support: 3,
      };

      const fallbackColWidth = containerRect.width > 0 ? containerRect.width / 4 : 280;

      let x1 = 0;
      let y1 = 30;
      let x2 = 0;
      let y2 = 30;

      if (fromEl && containerRect.width > 0) {
        const r = fromEl.getBoundingClientRect();
        x1 = r.left - containerRect.left + r.width / 2;
        y1 = Math.max(20, r.top - containerRect.top + 30);
      } else {
        const idx = deptIndexMap[activeCollaboration.fromDept] ?? 0;
        x1 = idx * fallbackColWidth + fallbackColWidth / 2;
      }

      if (toEl && containerRect.width > 0) {
        const r = toEl.getBoundingClientRect();
        x2 = r.left - containerRect.left + r.width / 2;
        y2 = Math.max(20, r.top - containerRect.top + 30);
      } else {
        const idx = deptIndexMap[activeCollaboration.toDept] ?? 1;
        x2 = idx * fallbackColWidth + fallbackColWidth / 2;
      }

      const dx = x2 - x1;
      const dist = Math.abs(dx);
      // Arc curves upwards above the department headers
      const arc = Math.max(35, Math.min(65, dist * 0.22));

      const cy = Math.min(y1, y2) - arc;
      const cx1 = x1 + dx * 0.25;
      const cy1 = cy;
      const cx2 = x1 + dx * 0.75;
      const cy2 = cy;

      const midX = (x1 + x2) / 2;
      const midY = cy - 6;

      const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

      setCoords({ x1, y1, x2, y2, cx1, cy1, cx2, cy2, midX, midY, d });
    };

    calculateCoords();
    window.addEventListener("resize", calculateCoords);
    return () => {
      window.removeEventListener("resize", calculateCoords);
    };
  }, [activeCollaboration, containerRef]);

  if (!activeCollaboration || !coords) return null;

  const deptColorMap: Record<DepartmentType, { main: string; mid: string }> = {
    marketing: { main: "#38bdf8", mid: "#818cf8" },
    merchandising: { main: "#06b6d4", mid: "#3b82f6" },
    operations: { main: "#f59e0b", mid: "#ec4899" },
    support: { main: "#10b981", mid: "#06b6d4" },
  };

  const origin = deptColorMap[activeCollaboration.fromDept] || { main: "#38bdf8", mid: "#818cf8" };
  const target = deptColorMap[activeCollaboration.toDept] || { main: "#a855f7", mid: "#818cf8" };

  return (
    <div className="ccCollabConnectorWrapper ccFadeIn" data-testid="cross-dept-connector">
      <svg className="ccCollabConnectorSvg">
        <defs>
          <linearGradient id="collabWireGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={origin.main} />
            <stop offset="50%" stopColor={target.mid} />
            <stop offset="100%" stopColor={target.main} />
          </linearGradient>
          <filter id="collabGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Glow Path */}
        <path d={coords.d} className="ccCollabWireBase" style={{ stroke: `${origin.main}33` }} />

        {/* Main Solid Gradient Wire */}
        <path d={coords.d} stroke="url(#collabWireGradient)" className="ccCollabWireGradient" />

        {/* Animated Flowing Light Beam */}
        <path d={coords.d} className="ccFlowingBeam" />

        {/* Anchor Rings at Origin and Target */}
        <circle cx={coords.x1} cy={coords.y1} r="7" className="ccConnectorAnchorRing" style={{ fill: `${origin.main}44`, stroke: origin.main }} />
        <circle cx={coords.x2} cy={coords.y2} r="7" className="ccConnectorAnchorTarget" style={{ fill: `${target.main}44`, stroke: target.main }} />

        {/* Traveling Light Pulse */}
        <circle r="4" fill="#f8fafc" filter="url(#collabGlow)">
          <animateMotion dur="1.3s" repeatCount="indefinite" path={coords.d} />
        </circle>
      </svg>

      {/* Floating Center Handoff Badge */}
      <div
        className="ccCollabFloatingBadge"
        style={{
          left: coords.midX,
          top: coords.midY,
          borderColor: `${target.main}aa`,
          boxShadow: `0 4px 20px ${target.main}55, 0 0 12px ${origin.main}44`,
        }}
      >
        <Zap size={12} className="ccPulseZap" style={{ color: target.main }} />
        <span>{activeCollaboration.label}</span>
      </div>
    </div>
  );
}
