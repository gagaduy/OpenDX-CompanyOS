// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef, Fragment } from "react";
import { Link } from "react-router-dom";
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
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"hub" | "orchestration" | "workforce">("hub");
  const [recentOutcomesOpen, setRecentOutcomesOpen] = useState(true);

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
      setSocialTokenFeedback(
        `Đã tự động gia hạn token cho ${platform === "facebook" ? "Facebook Fanpage" : "Instagram"} (${refreshed.accountName || accountId}) thành công! Không cần copy-paste.`,
      );
      if (marketingApi.getSocialTokensStatus) {
        const updated = await marketingApi.getSocialTokensStatus();
        setSocialTokensSummary(updated);
      }
    } catch (err: any) {
      setSocialTokenFeedback(`Lỗi khi gia hạn token: ${err?.message || "Không xác định"}`);
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
    const metaAppId = (import.meta as any).env?.VITE_META_APP_ID;
    if (!metaAppId || metaAppId === "123456789") {
      setSocialTokenModalOpen(true);
      setSocialTokenFeedback(
        "Chưa cấu hình VITE_META_APP_ID hợp lệ. Bạn có thể sử dụng mục '⚡ Nhập Token trực tiếp' hoặc 'Đồng bộ từ .env' trong cửa sổ quản lý để áp dụng ngay.",
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
      if (event.data?.type === "META_OAUTH_CODE" && event.data?.code) {
        window.removeEventListener("message", handleMessage);
        if (marketingApi?.exchangeSocialOAuthCode) {
          setSocialTokenActionLoading(true);
          try {
            const updated = await marketingApi.exchangeSocialOAuthCode({
              code: event.data.code,
              redirectUri,
              platform,
            });
            setSocialTokensSummary(updated);
            setSocialTokenFeedback("Đã kết nối lại và cấp Page Access Token mới thành công! Không cần dán token.");
          } catch (err: any) {
            setSocialTokenFeedback(`Lỗi khi đổi OAuth code: ${err?.message || "Không xác định"}`);
          } finally {
            setSocialTokenActionLoading(false);
          }
        }
      }
    };
    window.addEventListener("message", handleMessage);

    const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(
      metaAppId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_show_list,pages_read_engagement,pages_manage_posts`;
    window.open(oauthUrl, "MetaOAuth", `width=${popupWidth},height=${popupHeight},left=${left},top=${top}`);
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
      const res: any = await inventoryApi.applyOperationsProposal(operationsProposal.id, payload);
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
          <span className="ccStatBadge">9 Nhân sự AI</span>
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

        {successMessage && (
          <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: 8, padding: "0.75rem 1rem", color: "#6ee7b7", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        <form
          className="ccInputWrapper"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendStrategicTask();
          }}
        >
          <Sparkles className="ccSparkleIcon" size={20} />
          <input
            type="text"
            className="ccMainPromptInput"
            placeholder="Hãy giao việc chiến lược cho AI CEO (ví dụ: Quảng bá điện thoại NovaPhone 15 Pro Max trên Facebook)..."
            value={prompt}
            disabled={isSubmitting}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            type="submit"
            className="ccSendButton"
            disabled={isSubmitting || !prompt.trim()}
          >
            <Play size={14} fill="currentColor" />
            <span>{isSubmitting ? "Đang gửi..." : "Gửi"}</span>
          </button>
        </form>

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
                "Quảng bá sản phẩm NovaPhone 15 Pro Max trên Facebook với ưu đãi tặng tai nghe NovaBuds Pro",
              )
            }
          >
            <span>📢 Chiến dịch Marketing FB</span>
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
            <span>📦 Rà soát sức khỏe cửa hàng</span>
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
            <span>🎧 Kiểm toán đơn hàng & CSKH</span>
          </button>
        </div>

        {/* Recent Outcomes Dropdown */}
        <div className="ccRecentOutcomesContainer">
          <div
            className="ccRecentOutcomesHeader"
            onClick={() => setRecentOutcomesOpen((prev) => !prev)}
          >
            <span>Tác vụ gần đây</span>
            {recentOutcomesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
          {recentOutcomesOpen && (
            <div className="ccRecentOutcomesList">
              {tasks?.items && tasks.items.length > 0 &&
                tasks.items.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="ccRecentOutcomeItem"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setActiveWorkflowKind("orchestration");
                      setActiveTaskId(item.id);
                    }}
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
                ))}
              {/* Marketing campaigns history */}
              {_campaignsList && _campaignsList.length > 0 &&
                _campaignsList.slice(0, 5).map((camp) => {
                  const title =
                    camp.campaignName?.replace(/^Chiến dịch:\s*/, "") ||
                    camp.objective?.replace(/^Quảng bá sản phẩm và đăng bài lên mạng xã hội theo mục tiêu:\s*/, "") ||
                    camp.mandatoryMessage ||
                    `Chiến dịch Marketing (ID ${camp.id.slice(0, 8)})`;
                  return (
                    <div
                      key={camp.id}
                      className="ccRecentOutcomeItem"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setActiveWorkflowKind("marketing");
                        setActiveCampaignId(camp.id);
                      }}
                    >
                      <Megaphone size={15} color="#38bdf8" />
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: "1rem" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <strong>[Tiếp thị FB] {title}</strong> — Trạng thái: <em>{camp.state}</em>
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "#64748b", flexShrink: 0 }}>
                          {new Date(camp.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              {(!tasks?.items || tasks.items.length === 0) && (!_campaignsList || _campaignsList.length === 0) && (
                <div className="ccRecentOutcomeItem">
                  <CheckCircle2 size={16} className="ccCheckIcon" />
                  <span>Chưa có tác vụ nào gần đây. Hãy giao việc ở khung trên!</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2a. AI CEO Reasoning & Department Routing Transition Banner */}
      {isCeoThinking && (
        <div className="ccCeoThinkingBanner">
          <div className="ccCeoThinkingIcon">
            <Brain size={18} className="ccSpin" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: "0.92rem", marginBottom: "0.15rem" }}>
              👑 AI CEO đang suy nghĩ & định tuyến nhiệm vụ...
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "0.84rem" }}>
              {ceoThinkingText || "Đang phân tích bối cảnh, thẩm quyền và lựa chọn phòng ban phụ trách..."}
            </div>
          </div>
          <Loader2 size={18} color="#f59e0b" className="ccSpin" />
        </div>
      )}

      {/* 2b. AI CEO Strategic Decomposition Plan */}
      {ceoPlan && (
        <div className="ccCeoPlanCard">
          <div className="ccCeoPlanHeader">
            <div className="ccCeoPlanTitle">
              <Bot size={18} color="#fbbf24" />
              <span>Kế hoạch Điều phối Chiến lược của AI CEO</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="ccDeptCountBadge amber">
                <span className="ccPillDot" style={{ width: 6, height: 6 }} />
                <span>{ceoPlan.targetDept}</span>
              </span>
              <button
                type="button"
                className="ccQuickPill"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "#94a3b8" }}
                onClick={() => setCeoPlan(null)}
                title="Đóng bảng kế hoạch"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="ccCeoPlanGoal">
            <strong style={{ color: "#f59e0b" }}>Mục tiêu chiến lược: </strong>
            <span>{ceoPlan.goal}</span>
          </div>

          <div className="ccCeoPlanStepsList">
            {ceoPlan.steps.map((s, idx) => (
              <div key={idx} className={`ccCeoPlanStepItem ${s.status}`}>
                <div>
                  <div className="ccCeoStepRole">
                    {s.status === "running" ? (
                      <Loader2 size={14} color="#38bdf8" className="ccSpin" />
                    ) : s.status === "done" ? (
                      <CheckCircle2 size={14} color="#10b981" />
                    ) : (
                      <Clock size={14} color="#94a3b8" />
                    )}
                    <span>{s.role}</span>
                  </div>
                  <div className="ccCeoStepTask">{s.task}</div>
                </div>
                <span className={`ccCeoStepStatus ${s.status}`}>
                  {s.status === "running" && (
                    <span
                      className="ccPillDot"
                      style={{ width: 6, height: 6, background: "#38bdf8", boxShadow: "0 0 6px #38bdf8" }}
                    />
                  )}
                  <span>
                    {s.status === "running"
                      ? "Đang xử lý..."
                      : s.status === "done"
                      ? "Hoàn tất"
                      : "Chờ đến lượt"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Dynamic Pipeline Flow Bar */}
      <div className="ccPipelineBar">
        {ceoPlan?.steps ? (
          /* Dynamic Multi-Agent / Multi-Department CEO Plan Pipeline */
          <div className="ccPipelineSteps">
            {ceoPlan.steps.map((step, idx) => {
              const isRunning = step.status === "running";
              const isDone = step.status === "done";
              return (
                <Fragment key={idx}>
                  {idx > 0 && <ArrowRight className="ccPipelineArrow" size={14} />}
                  <div
                    className={`ccPipelineNode ${
                      isRunning ? "active" : isDone ? "completed" : ""
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 size={14} color="#10b981" />
                    ) : isRunning ? (
                      <Loader2 size={14} className="ccSpin" color="#38bdf8" />
                    ) : (
                      <Bot size={14} />
                    )}
                    <span>{step.role.replace(/\s*\([^)]*\)/, "")}</span>
                  </div>
                </Fragment>
              );
            })}
          </div>
        ) : activeWorkflowKind === "merchandising" ? (
          /* Merchandising / Catalog & Pricing Pipeline Flow */
          <div className="ccPipelineSteps">
            <div
              className={`ccPipelineNode ${
                marketingActiveAgent === "ceo" || isSubmitting || ceoPlan !== null ? "active" : ""
              }`}
            >
              <Bot size={14} />
              <span>AI CEO Tiếp nhận</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div
              className={`ccPipelineNode ${
                marketingActiveAgent === "catalog_copywriter" || (ceoPlan?.steps[0]?.status === "running" || ceoPlan?.steps[0]?.status === "done")
                  ? "active"
                  : ""
              }`}
            >
              <FileText size={14} />
              <span>Cây bút Sản phẩm (SEO)</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div
              className={`ccPipelineNode ${
                marketingActiveAgent === "pricing_strategist" || (ceoPlan?.steps[1]?.status === "running" || ceoPlan?.steps[1]?.status === "done")
                  ? "active"
                  : ""
              }`}
            >
              <DollarSign size={14} />
              <span>Chuyên gia Định giá</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div
              className={`ccPipelineNode ${
                merchandisingProposal?.status === "pending_approval" || merchandisingProposal?.status === "applied"
                  ? "active"
                  : ""
              }`}
            >
              <CheckCircle2 size={14} />
              <span>Chủ tịch Duyệt & Áp dụng</span>
            </div>
          </div>
        ) : activeWorkflowKind === "marketing" ? (
          /* Marketing Pipeline Flow */
          <div className="ccPipelineSteps">
            <div
              className={`ccPipelineNode ${
                marketingActiveAgent === "ceo" || isMarketingRunning || ceoPlan !== null ? "active" : ""
              }`}
            >
              <Bot size={14} />
              <span>AI CEO Tiếp nhận</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div
              className={`ccPipelineNode ${
                marketingActiveAgent === "marketing_content" || currentMarketingState === "content_drafting"
                  ? "active"
                  : ""
              }`}
            >
              <Megaphone size={14} />
              <span>Cây bút Tiếp thị</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div
              className={`ccPipelineNode ${
                marketingActiveAgent === "marketing_visual" || currentMarketingState === "visual_creation"
                  ? "active"
                  : ""
              }`}
            >
              <Palette size={14} />
              <span>Thiết kế Đồ họa</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div
              className={`ccPipelineNode ${
                marketingActiveAgent === "marketing_publisher" ||
                currentMarketingState === "campaign_review" ||
                currentMarketingState === "awaiting_human_approval"
                  ? "active"
                  : ""
              }`}
            >
              <Share2 size={14} />
              <span>Điều phối & Phê duyệt FB</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div className={`ccPipelineNode ${currentMarketingState === "completed" ? "active" : ""}`}>
              <Bot size={14} />
              <span>AI CEO Bàn giao</span>
            </div>
          </div>
        ) : (
          /* Orchestration Pipeline Flow */
          <div className="ccPipelineSteps">
            <div className={`ccPipelineNode ${isOrchestrationRunning ? "active" : ""}`}>
              <Bot size={14} />
              <span>AI CEO Tiếp nhận</span>
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
            <div className={`ccPipelineNode ${getBranchState("support") === "running" ? "active" : ""}`}>
              <Headphones size={14} />
              <span>Quản gia CSKH</span>
            </div>
            <ArrowRight className="ccPipelineArrow" size={14} />
            <div className={`ccPipelineNode ${currentOrchestrationState === "executive_synthesis" ? "active" : ""}`}>
              <Bot size={14} />
              <span>AI CEO Tổng hợp</span>
            </div>
          </div>
        )}

        <div className="ccPipelineStatus">
          {isRunning ? (
            <>
              <div className="ccReasoningIndicator">
                <span className="ccPulseDot" />
                <span>
                  Đang thực thi: {activeWorkflowKind === "marketing" ? currentMarketingState : currentOrchestrationState}...{" "}
                  {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}
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
                {activeWorkflowKind === "marketing"
                  ? activeCampaignDetail?.campaign.state
                    ? `Chiến dịch Marketing: ${activeCampaignDetail.campaign.state}`
                    : "Sẵn sàng nhận chiến dịch Marketing"
                  : activeOperations?.task.state
                    ? `Tác vụ gần nhất: ${activeOperations.task.state}`
                    : "Sẵn sàng nhận việc"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 4. In-Place Active Marketing Campaign Control & Deliverables (when active/selected) */}
      {activeCampaignDetail && (
        <div className="ccMarketingLiveCard">
          <div className="ccMarketingLiveHeader">
            <div className="ccMarketingLiveTitle">
              <Megaphone size={18} color="#38bdf8" />
              <span>{activeCampaignDetail.brief?.campaignName ?? "Chiến dịch Tiếp thị Facebook"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span
                className={`ccMarketingStatusBadge ${
                  activeCampaignDetail.campaign.state === "awaiting_human_approval"
                    ? "awaiting"
                    : activeCampaignDetail.campaign.state === "completed"
                      ? "live"
                      : "draft"
                }`}
              >
                {activeCampaignDetail.campaign.state === "awaiting_human_approval"
                  ? "⏳ Chờ Phê Duyệt"
                  : activeCampaignDetail.campaign.state === "completed"
                    ? "✅ Đã Đăng Live Facebook"
                    : activeCampaignDetail.campaign.state}
              </span>
              <button
                type="button"
                className="ccQuickPill"
                style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                onClick={() => {
                  setActiveCampaignDetail(null);
                  setActiveCampaignId(null);
                  setCeoPlan(null);
                }}
                title="Đóng / Làm mới bảng làm việc"
              >
                <X size={13} />
                <span>Đóng</span>
              </button>
            </div>
          </div>

          <div className="ccMarketingSplitGrid">
            {/* Left: Copy Preview */}
            <div className="ccMarketingContentBox">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                  Nội dung bài viết Facebook (Copy v{latestContent?.versionNumber ?? 1})
                </span>
                <span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 600 }}>
                  ✓ Kiểm duyệt chính sách: Đạt
                </span>
              </div>
              <h4 className="ccMarketingHeadline">{latestContent?.headline ?? latestContent?.primaryText ?? "Tiêu đề chiến dịch..."}</h4>
              <p className="ccMarketingBody">{latestContent?.body ?? activeCampaignDetail.brief?.mandatoryMessage}</p>
              <p className="ccMarketingHashtags">{latestContent?.hashtags?.join(" ") ?? "#NovaCommerce #KhuyenMai"}</p>
            </div>

            {/* Right: 1:1 Visual Preview */}
            <div className="ccMarketingVisualBox">
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                Ảnh quảng cáo vuông 1:1 (1080x1080)
              </span>
              {visualBlobUrl ? (
                <div
                  className="ccMarketingVisualPreview"
                  style={{
                    padding: 0,
                    overflow: "hidden",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    position: "relative",
                    background: "#090d16",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={visualBlobUrl}
                    alt="Ảnh quảng cáo sản phẩm 1:1"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
              ) : (
                <div className="ccMarketingVisualPreview">
                  <Palette size={32} color="#38bdf8" style={{ marginBottom: "0.5rem" }} />
                  <span>Ảnh đồ họa chuẩn Facebook 1:1</span>
                  <span style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.25rem" }}>
                    {latestVisual?.imageDigest ? `SHA-256: ${latestVisual.imageDigest.slice(0, 12)}...` : "PNG 1080x1080"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="ccMarketingActionsRow">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {activeCampaignDetail.campaign.state === "awaiting_human_approval" && (
                <>
                  <button
                    type="button"
                    className="ccMarketingActionBtn approve"
                    disabled={marketingActionLoading}
                    onClick={handleApproveMarketing}
                  >
                    <Check size={16} />
                    <span>
                      {marketingActionLoading
                        ? "Đang xử lý..."
                        : (activeCampaignDetail.currentPackage?.targets?.length ?? 0) > 1
                          ? "Phê duyệt & Đăng lên Facebook & Instagram"
                          : activeCampaignDetail.currentPackage?.targets?.[0]?.platform === "instagram"
                            ? "Phê duyệt & Đăng ngay lên Instagram"
                            : "Phê duyệt & Đăng ngay lên Facebook"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ccMarketingActionBtn revision"
                    disabled={marketingActionLoading}
                    onClick={() => setShowRevisionForm((prev) => !prev)}
                  >
                    <RotateCcw size={14} />
                    <span>Yêu cầu chỉnh sửa</span>
                  </button>
                </>
              )}

              {(activeCampaignDetail.campaign.state === "failed" || activeCampaignDetail.campaign.state === "partial_failure") && (
                <button
                  type="button"
                  className="ccMarketingActionBtn approve"
                  disabled={marketingActionLoading}
                  onClick={handleRetryPublication}
                >
                  <RotateCcw size={14} />
                  <span>
                    {marketingActionLoading
                      ? "Đang thử lại..."
                      : activeCampaignDetail.currentPackage?.targets?.some((t) => t.platform === "facebook" && t.status !== "verified") &&
                        activeCampaignDetail.currentPackage?.targets?.some((t) => t.platform === "instagram" && t.status !== "verified")
                        ? "Thử đăng lại Facebook & Instagram"
                        : activeCampaignDetail.currentPackage?.targets?.some((t) => t.platform === "facebook" && t.status !== "verified")
                          ? "Thử đăng lại lên Facebook"
                          : "Thử đăng lại lên Instagram"}
                  </span>
                </button>
              )}

              {(() => {
                const records = (activeCampaignDetail.publicationRecords && activeCampaignDetail.publicationRecords.length > 0)
                  ? activeCampaignDetail.publicationRecords
                  : (activeCampaignDetail.publicationRecord ? [activeCampaignDetail.publicationRecord] : []);

                const fbRecord = records.find((r) => r.platform === "facebook" && r.postUrl);
                const igRecord = records.find((r) => r.platform === "instagram" && r.postUrl);

                return (
                  <>
                    {fbRecord?.postUrl && (
                      <a
                        href={fbRecord.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ccMarketingActionBtn livePost"
                      >
                        <ExternalLink size={14} />
                        <span>Xem bài đăng Facebook live ↗</span>
                      </a>
                    )}
                    {igRecord?.postUrl && (
                      <a
                        href={igRecord.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ccMarketingActionBtn livePost"
                        style={{
                          background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                          color: "#ffffff",
                          borderColor: "rgba(255, 255, 255, 0.2)",
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Xem bài đăng Instagram live ↗</span>
                      </a>
                    )}
                  </>
                );
              })()}

              {activeCampaignDetail.campaign.state === "completed" && activeCampaignDetail.artifacts.length === 0 && (
                <button
                  type="button"
                  className="ccMarketingActionBtn revision"
                  disabled={marketingActionLoading}
                  onClick={handleGenerateDeliverables}
                >
                  <FileText size={14} />
                  <span>Tạo 5 tệp bàn giao (Deliverables)</span>
                </button>
              )}
            </div>

            {/* Deliverables Download Links */}
            {activeCampaignDetail.artifacts.length > 0 && (
              <div className="ccMarketingDeliverablesList">
                <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>Tài liệu bàn giao:</span>
                {activeCampaignDetail.artifacts.map((art) => (
                  <a
                    key={art.id}
                    href={marketingApi?.getArtifactDownloadUrl(art.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="ccMarketingDeliverablePill"
                    download
                  >
                    <Download size={12} />
                    <span>{art.filename}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Revision Form Collapse */}
          {showRevisionForm && (
            <div className="ccMarketingRevisionBox">
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#fbbf24", marginBottom: "0.5rem" }}>
                Ghi chú yêu cầu chỉnh sửa cho 3 nhân sự số Marketing:
              </label>
              <textarea
                className="ccMarketingRevisionTextarea"
                placeholder="Ví dụ: Đổi màu nền ảnh sang tông đỏ cam và nhấn mạnh thêm ưu đãi tặng tai nghe..."
                value={revisionInput}
                onChange={(e) => setRevisionInput(e.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="ccQuickPill"
                  onClick={() => setShowRevisionForm(false)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="ccMarketingActionBtn revision"
                  disabled={!revisionInput.trim() || marketingActionLoading}
                  onClick={handleRevisionMarketing}
                >
                  <span>Gửi yêu cầu sửa đổi</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4b. In-Place Active Catalog & Pricing Merchandising Proposal Card */}
      {merchandisingProposal && (
        <div className="ccMarketingLiveCard ccMerchProposalCard">
          <div className="ccMarketingLiveHeader">
            <div className="ccMarketingLiveTitle">
              <Package size={18} color="#38bdf8" />
              <span>
                {merchandisingProposal.items && merchandisingProposal.items.length > 1
                  ? `Đề xuất Chiến lược Giá & Danh mục cho ${merchandisingProposal.items.length} Sản phẩm`
                  : `Đề xuất Chiến lược Giá & Tối ưu Danh mục: ${merchandisingProposal.productName || merchandisingProposal.items?.[0]?.productName}`}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span
                className={`ccMarketingStatusBadge ${
                  merchandisingProposal.status === "pending_approval"
                    ? "awaiting"
                    : merchandisingProposal.status === "applied"
                      ? "live"
                      : "draft"
                }`}
              >
                {merchandisingProposal.status === "pending_approval"
                  ? "⏳ Chờ Phê Duyệt Giá"
                  : merchandisingProposal.status === "applied"
                    ? "✅ Đã Áp Dụng Lên Storefront"
                    : merchandisingProposal.status}
              </span>
              <a
                href="http://localhost:3100"
                target="_blank"
                rel="noreferrer"
                className="ccFbPostLink"
                style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", borderColor: "rgba(56, 189, 248, 0.3)" }}
              >
                <span>Xem Cửa hàng Storefront</span>
                <ExternalLink size={12} />
              </a>
              <button
                type="button"
                className="ccQuickPill"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "#94a3b8" }}
                onClick={() => setMerchandisingProposal(null)}
                title="Đóng bảng đề xuất"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Cross-Department Collaboration Banner */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.65rem 1rem",
            marginBottom: "1rem",
            borderRadius: "8px",
            background: "linear-gradient(90deg, rgba(99, 102, 241, 0.15), rgba(6, 182, 212, 0.15))",
            border: "1px solid rgba(99, 102, 241, 0.35)",
            fontSize: "0.82rem",
            color: "#e2e8f0"
          }}>
            <Sparkles size={16} color="#818cf8" style={{ flexShrink: 0 }} />
            <span>
              <strong>Phối hợp liên phòng ban:</strong>{" "}
              <span style={{ color: "#a5b4fc", fontWeight: 600 }}>Phòng Tiếp thị & Sáng tạo</span> (Thiết kế Visual & Đồ họa AI) 🤝{" "}
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>Phòng Danh mục & Định giá</span> (Định giá chiết khấu SCD Type 2 & SEO)
            </span>
          </div>

          {/* Strategy Rationale & Sales Projection Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="ccProposalRationaleBox amber">
              <strong style={{ color: "#fbbf24", fontSize: "0.82rem", display: "block", marginBottom: "0.2rem" }}>
                💡 Lý do chiến lược định giá:
              </strong>
              <p>
                {merchandisingProposal.pricingRationale}
              </p>
            </div>
            <div className="ccProposalRationaleBox cyan">
              <strong style={{ color: "#38bdf8", fontSize: "0.82rem", display: "block", marginBottom: "0.2rem" }}>
                📈 Dự báo lượng bán:
              </strong>
              <p>
                {merchandisingProposal.salesProjection}
              </p>
            </div>
          </div>

          {campaignProposal ? (
            /* Multi-product Campaign Proposal Card */
            <div className="ccCampaignOverviewCard">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <span className="ccCampaignBadgePill">{campaignProposal.badgeText}</span>
                <span className="ccCampaignDiscountPill">-{campaignProposal.discountPercent}%</span>
                <span className="ccCampaignDurationText">
                  Thời hạn: {campaignProposal.durationDays} ngày
                </span>
              </div>

              {/* Thumbnails preview strip */}
              <div>
                <span className="ccCampaignPreviewHeading">
                  Xem trước {campaignProposal.items.length} sản phẩm áp dụng:
                </span>
                <div style={{ display: "flex", gap: "0.6rem", overflowX: "auto", paddingBottom: "0.4rem" }}>
                  {campaignProposal.items.map((it) => {
                    const imgUrl = resolveMediaUrl(it.campaignMediaUrl || it.originalMediaUrl, apiBaseUrl);
                    return (
                      <div
                        key={it.id}
                        title={`${it.productName} (${it.campaignPriceVnd.toLocaleString("vi-VN")} ₫)`}
                        className="ccCampaignPreviewMiniThumb"
                      >
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={it.productName}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.3"; }}
                          />
                        ) : (
                          <Sparkles size={18} color="#818cf8" style={{ position: "absolute", inset: "50%", transform: "translate(-50%, -50%)" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Button to Open Fullscreen Modal */}
              <button
                type="button"
                className="ccCampaignOpenModalBtn"
                onClick={() => setCampaignProposalModalOpen(true)}
              >
                <Sparkles size={16} />
                <span>Xem Thiết Kế Poster & Phê Duyệt ({campaignProposal.items.length} SP)</span>
              </button>
            </div>
          ) : (
            /* Single Product Proposal */
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {(merchandisingProposal.items || []).map((item, idx) => {
                const imgUrl = resolveMediaUrl(item.campaignMediaUrl || item.originalMediaUrl, apiBaseUrl);
                return (
                  <div
                    key={item.targetProductId || idx}
                    className="ccMerchProductCard"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1fr",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{
                      width: 90,
                      height: 90,
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      background: "#0b0f19",
                    }}>
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={item.optimizedTitle}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <Sparkles size={20} color="#818cf8" />
                      )}
                    </div>
                    <div>
                      <h4 className="ccMerchProductTitle" style={{ fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                        {item.optimizedTitle}
                      </h4>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", fontSize: "0.8rem" }}>
                        <del style={{ color: "#64748b" }}>{item.originalPriceVnd.toLocaleString("vi-VN")} đ</del>
                        <span style={{ color: "#10b981", fontWeight: 700 }}>{item.proposedPriceVnd.toLocaleString("vi-VN")} đ</span>
                        <span style={{ color: "#f43f5e", fontWeight: 600 }}>(-{item.discountPercent}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
            {merchandisingProposal.status === "pending_approval" && !campaignProposal && (
              <button
                type="button"
                className="ccMarketingActionBtn approve"
                disabled={merchandisingLoading}
                onClick={handleApplyMerchandisingProposal}
                style={{ padding: "0.65rem 1.25rem", fontSize: "0.85rem" }}
              >
                {merchandisingLoading ? <Loader2 size={16} className="ccSpin" /> : <CheckCircle2 size={16} />}
                <span>Duyệt & Áp dụng ngay lên Storefront</span>
              </button>
            )}
            {merchandisingProposal.status === "applied" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#10b981", fontWeight: 700, fontSize: "0.85rem" }}>
                  <CheckCircle2 size={18} color="#10b981" />
                  <span>Đã áp dụng thành công lên Storefront!</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setMerchandisingProposal(null); setCampaignProposal(null); }}
                  className="ccCampaignCancelBtn"
                  style={{ padding: "0.3rem 0.65rem", fontSize: "0.75rem" }}
                >
                  Thu gọn
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4c. Interactive Operations & Inventory Restock Proposal Modal */}
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

      {/* 4d. Customer Support & CRM Live Proposal Card (Emerald Theme) */}
      {supportProposal && (
        <div className="ccMarketingLiveCard ccSupportProposalCard">
          {/* Card Header */}
          <div className="ccMarketingLiveHeader">
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div className="ccDeptIconBadge emerald">
                <Headphones size={18} />
              </div>
              <div>
                <div className="ccSupportHeaderTitle">
                  Bảng Đề Xuất Xử Lý Khiếu Nại &amp; Chăm Sóc Khách Hàng (Support &amp; CRM)
                </div>
                <div className="ccSupportHeaderSubtitle">
                  Được đồng lập bởi <strong>Quản gia CSKH</strong> (Phân tích CSAT) &amp; <strong>Chuyên viên CRM</strong> (Phân khúc VIP &amp; Churn Risk)
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="ccDeptCountBadge emerald">
                <span className="ccPillDot emerald" />
                <span>{supportProposal.status === "applied" ? "Đã duyệt xử lý" : "Chờ Giám đốc duyệt"}</span>
              </span>
              <button
                type="button"
                className="ccQuickPill"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                onClick={() => setSupportProposal(null)}
                title="Đóng bảng đề xuất"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Overall Sentiment & Churn Assessment */}
          <div className="ccProposalSummaryGrid">
            <div className="ccProposalSummaryBox emerald">
              <div className="ccProposalSummaryHeader emerald">
                <HeartHandshake size={15} />
                <span>Tổng quan Tâm lý CSAT</span>
              </div>
              <p className="ccProposalSummaryText">
                {supportProposal.overallSentimentSummary}
              </p>
            </div>

            <div className="ccProposalSummaryBox danger">
              <div className="ccProposalSummaryHeader danger">
                <AlertTriangle size={15} />
                <span>Đánh giá Nguy cơ Rời bỏ (Churn Risk)</span>
              </div>
              <p className="ccProposalSummaryText">
                {supportProposal.churnRiskAssessment}
              </p>
            </div>
          </div>

          {/* Table of Support Tickets */}
          <div className="ccProposalTableContainer" style={{ marginBottom: "1rem" }}>
            <table className="ccProposalTable">
              <thead>
                <tr className="ccProposalTableThRow">
                  <th>Khách hàng</th>
                  <th>Sự cố &amp; Phân loại</th>
                  <th style={{ textAlign: "center" }}>Tâm lý</th>
                  <th style={{ textAlign: "center" }}>Rủi ro Churn</th>
                  <th>Kịch bản phản hồi 5 sao &amp; Đề xuất đền bù</th>
                </tr>
              </thead>
              <tbody>
                {supportProposal.tickets
                  .slice((supportTicketsPage - 1) * 5, supportTicketsPage * 5)
                  .map((t) => (
                    <tr key={t.ticketId} className="ccProposalTableTr">
                      <td>
                        <div className="ccProposalCustomerName">{t.customerName}</div>
                        <div className="ccProposalItemSubtext">{t.customerEmail}</div>
                      </td>
                      <td>
                        <div className="ccProposalItemName">{t.subject}</div>
                        <span className="ccIssueCategoryBadge">
                          {t.issueCategory}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`ccSentimentBadge ${
                            t.sentiment === "angry" || t.sentiment === "frustrated" ? "danger" : "safe"
                          }`}
                        >
                          {t.sentiment.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`ccSentimentBadge ${
                            t.churnRisk === "high" ? "danger" : t.churnRisk === "medium" ? "amber" : "safe"
                          }`}
                        >
                          {t.churnRisk.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <CompactProposedResponse text={t.proposedResponse} />
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
                          <span className="ccCompensationBadge">
                            🎁 Đền bù: {t.suggestedCompensation}
                          </span>
                          {supportProposal.status === "applied" && (
                            <span className="ccSentBadge">
                              ✉️ Email đã gửi
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <ProposalPagination
              currentPage={supportTicketsPage}
              totalPages={Math.max(1, Math.ceil(supportProposal.tickets.length / 5))}
              totalItems={supportProposal.tickets.length}
              pageSize={5}
              itemName="khiếu nại"
              onPageChange={setSupportTicketsPage}
            />
          </div>

          {/* Table of VIP & Loyal Customers */}
          {supportProposal.vipCustomers && supportProposal.vipCustomers.length > 0 && (
            <div className="ccProposalTableContainer">
              <div className="ccProposalTableSectionHeader">
                💎 Phân Khúc Khách Hàng VIP &amp; Chiến Lược Giữ Chân
              </div>
              <table className="ccProposalTable">
                <thead>
                  <tr className="ccProposalTableThRow">
                    <th>Khách hàng</th>
                    <th style={{ textAlign: "center" }}>Phân khúc</th>
                    <th style={{ textAlign: "right" }}>Tổng chi tiêu</th>
                    <th>Chiến lược chăm sóc riêng biệt</th>
                  </tr>
                </thead>
                <tbody>
                  {supportProposal.vipCustomers
                    .slice((supportVipPage - 1) * 5, supportVipPage * 5)
                    .map((vip) => (
                      <tr key={vip.customerId} className="ccProposalTableTr">
                        <td className="ccProposalCustomerName">{vip.customerName}</td>
                        <td style={{ textAlign: "center" }}>
                          <span className="ccVipSegmentBadge">
                            {vip.segment}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }} className="ccRestockCost">
                          {vip.totalSpentVnd.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="ccProposalItemSubtext">{vip.engagementRecommendation}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <ProposalPagination
                currentPage={supportVipPage}
                totalPages={Math.max(1, Math.ceil((supportProposal.vipCustomers?.length || 0) / 5))}
                totalItems={supportProposal.vipCustomers?.length || 0}
                pageSize={5}
                itemName="khách hàng VIP"
                onPageChange={setSupportVipPage}
              />
            </div>
          )}

          {/* Action Row */}
          <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="ccMarketingActionBtn livePost"
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1.2rem" }}
                disabled={isDownloadingSupportDocx}
                onClick={handleDownloadSupportDocx}
              >
                <FileText size={15} />
                <span>{isDownloadingSupportDocx ? "Đang tạo file..." : "📥 Tải Báo Cáo Word (.docx)"}</span>
              </button>
            </div>

            {supportProposal.status === "pending_approval" && (
              <button
                type="button"
                className="ccMarketingActionBtn approve"
                style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem", background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
                disabled={supportActionLoading}
                onClick={handleApplySupport}
              >
                {supportActionLoading ? <Loader2 size={16} className="ccSpin" /> : <CheckCircle2 size={16} />}
                <span>
                  {supportActionLoading
                    ? "Đang gửi email & cấp voucher..."
                    : `✓ Phê duyệt & Gửi Email phản hồi (${supportProposal.tickets.length} ticket kèm Voucher)`}
                </span>
              </button>
            )}
            {supportProposal.status === "applied" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#10b981", fontWeight: 700, fontSize: "0.95rem" }}>
                <CheckCircle2 size={20} color="#10b981" />
                <span>✉️ Đã phê duyệt, gửi email phản hồi & kích hoạt voucher cho toàn bộ khách hàng!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4e. Global Active Merchandising Campaign Live Monitor Banner */}
      {activeCampaign && (
        <div style={{ marginTop: "2rem", marginBottom: "0.5rem" }}>
          <ActiveCampaignWidget
            campaign={activeCampaign}
            onRevert={handleEmergencyRevertCampaign}
            isReverting={isRevertingCampaign}
          />
        </div>
      )}

      {/* 4f. Global Social Tokens System Notice Bar (Slim full-width notice strip) */}
      {socialTokensSummary && (socialTokensSummary.urgentActionRequired || socialTokensSummary.hasExpiringOrInvalid) && !dismissedSocialTokenAlerts && (
        <div className="ccSocialTokenGlobalBanner" role="alert">
          <div className="ccSocialTokenGlobalBannerLeft">
            {socialTokensSummary.urgentActionRequired ? (
              <ShieldAlert size={16} color="#ef4444" />
            ) : (
              <Zap size={16} color="#f59e0b" />
            )}
            <span className="ccSocialTokenGlobalBannerText">
              {socialTokensSummary.urgentActionRequired
                ? "Cảnh báo Hệ thống: Access Token mạng xã hội (Facebook/Instagram) đã hết hạn hoặc phiên đăng nhập bị hủy. Cần cập nhật token mới để đảm bảo chiến dịch xuất bản tự động."
                : "Nhắc nhở Hệ thống: Một số Access Token mạng xã hội sắp hết hạn trong vòng 7 ngày tới."}
            </span>
          </div>
          <div className="ccSocialTokenGlobalBannerRight">
            <button
              type="button"
              className="ccSocialTokenActionBtn detail"
              onClick={() => setSocialTokenModalOpen(true)}
            >
              <span>⚡ Quản lý & Cập nhật Token</span>
            </button>
            <button
              type="button"
              className="ccSocialTokenDismissBtn"
              onClick={() => setDismissedSocialTokenAlerts(true)}
              title="Thu gọn cảnh báo"
              aria-label="Thu gọn cảnh báo"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 5. Unified Department Workforce Grid (4 Distinct Functional Departments) */}
      <div
        ref={departmentsGridRef}
        className="ccDepartmentGrid"
        style={{ marginTop: activeCampaign || (socialTokensSummary && (socialTokensSummary.urgentActionRequired || socialTokensSummary.hasExpiringOrInvalid) && !dismissedSocialTokenAlerts) ? "1rem" : "2rem", position: "relative" }}
      >
        <CrossDepartmentConnector
          activeCollaboration={activeCollaboration}
          containerRef={departmentsGridRef}
        />

        {/* Column 1: Tiếp thị & Sáng tạo (Blue Theme) */}
        <div id="dept-column-marketing" className="ccDepartmentColumn theme-blue">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <div className="ccDeptIconBadge">
                <Megaphone size={16} />
              </div>
              <span>Tiếp thị & Sáng tạo</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {socialTokensSummary && (
                (() => {
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
                    badgeText = `⚡ Token FB hết hạn sau ${days ?? 7} ngày`;
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
                })()
              )}

              {departmentQueues.marketing.length > 0 && (
                <span className="ccDeptQueueBadge">
                  <Clock size={11} className="ccSpinSlow" />
                  <span>Hàng chờ: {departmentQueues.marketing.length}</span>
                </span>
              )}
              <span className="ccDeptCountBadge">
                <span className="ccPillDot" style={{ width: 6, height: 6, background: "#38bdf8" }} />
                <span>3 Nhân sự</span>
              </span>
            </div>
          </div>

          {/* Social Token Proactive Alert Card (Compact & Dismissable) */}
          {!dismissedSocialTokenAlerts && socialTokensSummary?.accounts?.filter(
            (acc) => acc.requiresAction || acc.status === "expiring_soon" || acc.status === "expired" || acc.status === "invalid"
          ).map((acc) => {
            const isDanger = acc.status === "expired" || acc.status === "invalid";
            const title = isDanger
              ? `🚨 Token ${acc.platform === "facebook" ? "Facebook" : "Instagram"} đã hết hạn / lỗi`
              : `⚡ Token ${acc.platform === "facebook" ? "Facebook" : "Instagram"} sắp hết hạn (${acc.daysRemaining ?? 0} ngày)`;

            return (
              <div
                key={`alert-${acc.platform}-${acc.accountId}`}
                className={`ccSocialTokenAlertCard compact ${isDanger ? "danger" : ""}`}
                role="alert"
              >
                <div className="ccSocialTokenAlertHeader">
                  <div className="ccSocialTokenAlertTitleGroup">
                    {isDanger ? <ShieldAlert size={13} /> : <Zap size={13} />}
                    <span className="ccSocialTokenAlertTitle">{title}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <span className="accountIdTag">{acc.accountName || acc.accountId}</span>
                    <button
                      type="button"
                      className="ccSocialTokenDismissBtn"
                      onClick={() => setDismissedSocialTokenAlerts(true)}
                      title="Thu gọn cảnh báo này"
                      aria-label="Thu gọn cảnh báo"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                <p className="ccSocialTokenAlertMeta">
                  {acc.lastError || acc.message || `Token ${acc.tokenPreview} sẽ hết hạn trong ${acc.daysRemaining} ngày. Bấm để gia hạn tự động 1-click mà không cần dán token.`}
                </p>

                <div className="ccSocialTokenAlertActions">
                  {(acc.actionType === "auto_refresh" || acc.status === "expiring_soon") && (
                    <button
                      type="button"
                      className="ccSocialTokenActionBtn renew"
                      onClick={() => handleRefreshSocialAccount(acc.platform, acc.accountId)}
                      disabled={socialTokenActionLoading}
                    >
                      {socialTokenActionLoading ? (
                        <Loader2 size={12} className="ccSpinSlow" />
                      ) : (
                        <Zap size={12} />
                      )}
                      <span>Tự động Gia hạn ngay</span>
                    </button>
                  )}

                  {(acc.actionType === "oauth_reconnect" || isDanger) && (
                    <button
                      type="button"
                      className="ccSocialTokenActionBtn reconnect"
                      onClick={() => handleOAuthReconnect(acc.platform)}
                      disabled={socialTokenActionLoading}
                    >
                      <ExternalLink size={12} />
                      <span>1-Click Kết nối lại</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="ccSocialTokenActionBtn detail"
                    onClick={() => setSocialTokenModalOpen(true)}
                  >
                    <span>Chi tiết</span>
                  </button>
                </div>
              </div>
            );
          })}

          <AgentCard
            name="Cây bút Tiếp thị"
            roleTag="SKILL"
            theme="blue"
            status={
              deptStatus.marketing.activeAgent === "marketing_copywriter" ||
              marketingActiveAgent === "marketing_content"
                ? "running"
                : deptStatus.marketing.completedAgents.includes("marketing_copywriter") ||
                  activeCampaignDetail ||
                  ceoPlan?.steps[0]?.status === "done"
                ? "completed"
                : "idle"
            }
            statusText={
              deptStatus.marketing.activeAgent === "marketing_copywriter"
                ? deptStatus.marketing.agentMessage ?? "Đang soạn thảo bài viết và bộ hashtag..."
                : marketingActiveAgent === "marketing_content"
                ? marketingAgentMessage ?? "Đang soạn thảo bài viết và bộ hashtag..."
                : deptStatus.marketing.completedAgents.includes("marketing_copywriter") ||
                  activeCampaignDetail ||
                  ceoPlan?.steps[0]?.status === "done"
                ? "Đã hoàn thành soạn thảo bài viết và bộ hashtag"
                : undefined
            }
            showProgress={
              deptStatus.marketing.activeAgent === "marketing_copywriter" ||
              marketingActiveAgent === "marketing_content"
            }
            waitingTasksCount={getAgentWaitingTasksCount("marketing_copywriter")}
          />
          <AgentCard
            name="Thiết kế Đồ họa"
            roleTag="SKILL"
            theme="blue"
            isCollaborating={
              activeCollaboration?.toDept === "marketing" ||
              marketingActiveAgent === "merchandising_visual_collab"
            }
            collabTag={activeCollaboration?.toDept === "marketing" ? "Phối hợp liên phòng" : "Phối hợp cùng Danh mục"}
            status={
              deptStatus.marketing.activeAgent === "marketing_visual" ||
              marketingActiveAgent === "marketing_visual" ||
              marketingActiveAgent === "merchandising_visual_collab" ||
              currentMarketingState === "visual_creation"
                ? "running"
                : deptStatus.marketing.completedAgents.includes("marketing_visual") ||
                  (marketingActiveAgent === "pricing_strategist" && ceoPlan?.targetDept?.includes("Phối hợp")) ||
                  (merchandisingProposal && ceoPlan?.targetDept?.includes("Phối hợp")) ||
                  campaignProposal ||
                  activeCampaignDetail ||
                  ceoPlan?.steps[1]?.status === "done"
                ? "completed"
                : "idle"
            }
            statusText={
              deptStatus.marketing.activeAgent === "marketing_visual"
                ? deptStatus.marketing.agentMessage ?? "Đang tạo ảnh poster 1:1 chuẩn Facebook..."
                : marketingActiveAgent === "merchandising_visual_collab"
                ? marketingAgentMessage ?? "Đang thiết kế poster & banner cho Danh mục..."
                : marketingActiveAgent === "marketing_visual"
                ? marketingAgentMessage ?? "Đang tạo ảnh poster 1:1 chuẩn Facebook..."
                : deptStatus.marketing.completedAgents.includes("marketing_visual")
                ? "Đã hoàn thành thiết kế poster & banner chiến dịch"
                : (marketingActiveAgent === "pricing_strategist" || merchandisingProposal) && ceoPlan?.targetDept?.includes("Phối hợp")
                ? "Đã hoàn thành thiết kế poster chiến dịch cho Danh mục"
                : campaignProposal
                ? "Đã hoàn tất thiết kế poster & banner xả hàng"
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
            name="Điều phối Xuất bản"
            roleTag="ĐỘI"
            theme="blue"
            status={
              deptStatus.marketing.activeAgent === "marketing_publisher" ||
              marketingActiveAgent === "marketing_publisher"
                ? "running"
                : deptStatus.marketing.completedAgents.includes("marketing_publisher") ||
                  currentMarketingState === "campaign_review" ||
                  currentMarketingState === "awaiting_human_approval" ||
                  activeCampaignDetail?.campaign.state === "completed" ||
                  activeCampaignDetail !== null
                ? "completed"
                : "idle"
            }
            statusText={
              deptStatus.marketing.activeAgent === "marketing_publisher"
                ? deptStatus.marketing.agentMessage ?? "Đang chuẩn bị gói xuất bản Fanpage..."
                : marketingActiveAgent === "marketing_publisher"
                ? marketingAgentMessage ?? "Đang đóng gói và điều phối đăng bài Fanpage..."
                : currentMarketingState === "awaiting_human_approval"
                ? "Đã đóng gói và sẵn sàng xuất bản (đang chờ phê duyệt)"
                : activeCampaignDetail?.campaign.state === "completed"
                ? "Đã xuất bản thành công lên Facebook & Instagram"
                : deptStatus.marketing.completedAgents.includes("marketing_publisher")
                ? "Đã hoàn tất điều phối xuất bản"
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
              <p className="ccWaitingCardPrompt">"{task.prompt}"</p>
              <div className="ccWaitingCardResource">
                <span className="ccWaitingDot" />
                <span>
                  Đang đợi {task.waitingForResource?.agentName || "nhân sự phối hợp"} hoàn tất việc...
                </span>
              </div>
            </div>
          ))}

          {activeCampaignDetail && (
            <button
              type="button"
              className="ccOperationsQuickBtn"
              style={{ marginTop: "0.25rem", width: "100%", justifyContent: "center", padding: "0.45rem 0.6rem", borderColor: "rgba(59, 130, 246, 0.4)", color: "#60a5fa" }}
              onClick={() => {
                const el = document.getElementById("marketing-proposal-section");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Megaphone size={14} color="#3b82f6" />
              <span>Xem Bài Viết Fanpage</span>
            </button>
          )}

          <DepartmentInput
            placeholder="Giao việc cho Tiếp thị & Sáng tạo..."
            theme="blue"
            onSend={(text) => handleDepartmentDirectTask("marketing", text)}
          />
        </div>

        {/* Column 2: Danh mục & Định giá (Cyan Theme) */}
        <div id="dept-column-merchandising" className="ccDepartmentColumn theme-cyan">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <div className="ccDeptIconBadge">
                <Package size={16} />
              </div>
              <span>Danh mục & Định giá</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {pendingHandoff?.dept === "merchandising" ? (
                <span className="ccDeptQueueBadge" style={{ borderColor: "rgba(6, 182, 212, 0.5)", color: "#22d3ee" }}>
                  <Clock size={11} className="ccSpinSlow" />
                  <span>Chờ bàn giao: 1</span>
                </span>
              ) : departmentQueues.merchandising.length > 0 ? (
                <span className="ccDeptQueueBadge">
                  <Clock size={11} className="ccSpinSlow" />
                  <span>Hàng chờ: {departmentQueues.merchandising.length}</span>
                </span>
              ) : null}
              <span className="ccDeptCountBadge">
                <span className="ccPillDot" style={{ width: 6, height: 6, background: "#06b6d4" }} />
                <span>2 Nhân sự</span>
              </span>
            </div>
          </div>

          <AgentCard
            name="Cây bút Sản phẩm"
            roleTag="SKILL"
            theme="cyan"
            status={
              deptStatus.merchandising.activeAgent === "catalog_copywriter" ||
              marketingActiveAgent === "catalog_copywriter"
                ? "running"
                : deptStatus.merchandising.completedAgents.includes("catalog_copywriter") ||
                  marketingActiveAgent === "merchandising_visual_collab" ||
                  marketingActiveAgent === "pricing_strategist" ||
                  marketingActiveAgent === "merchandising_clearance_calc" ||
                  merchandisingProposal ||
                  campaignProposal
                ? "completed"
                : "idle"
            }
            statusText={
              deptStatus.merchandising.activeAgent === "catalog_copywriter"
                ? deptStatus.merchandising.agentMessage ?? "Đang tối ưu tên sản phẩm và mô tả SEO..."
                : marketingActiveAgent === "catalog_copywriter"
                ? marketingAgentMessage ?? "Đang tối ưu tên sản phẩm và mô tả SEO..."
                : deptStatus.merchandising.completedAgents.includes("catalog_copywriter") ||
                  marketingActiveAgent === "merchandising_visual_collab" ||
                  marketingActiveAgent === "pricing_strategist" ||
                  marketingActiveAgent === "merchandising_clearance_calc" ||
                  merchandisingProposal ||
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
            roleTag="ASSISTANT"
            theme="cyan"
            isCollaborating={
              activeCollaboration?.toDept === "merchandising" ||
              marketingActiveAgent === "merchandising_clearance_calc"
            }
            collabTag="Tiếp nhận từ Kho vận"
            status={
              deptStatus.merchandising.activeAgent === "pricing_strategist" ||
              marketingActiveAgent === "pricing_strategist" ||
              marketingActiveAgent === "merchandising_clearance_calc"
                ? "running"
                : deptStatus.merchandising.completedAgents.includes("pricing_strategist") ||
                  merchandisingProposal ||
                  campaignProposal
                ? "completed"
                : "idle"
            }
            statusText={
              deptStatus.merchandising.activeAgent === "pricing_strategist"
                ? deptStatus.merchandising.agentMessage ?? "Đang tính toán chiết khấu và giá khuyến mãi..."
                : marketingActiveAgent === "merchandising_clearance_calc"
                ? marketingAgentMessage ?? "Đang tiếp nhận SKU tồn kho, tính toán giá xả hàng & biên lợi nhuận..."
                : marketingActiveAgent === "merchandising_visual_collab"
                ? "⏳ Đang chuyển giao sang Thiết kế Đồ họa vẽ poster..."
                : marketingActiveAgent === "pricing_strategist"
                ? marketingAgentMessage ?? "Đang tính toán giá Flash Sale & biên lợi nhuận..."
                : deptStatus.merchandising.completedAgents.includes("pricing_strategist") ||
                  merchandisingProposal ||
                  campaignProposal
                ? "Đã hoàn tất tính toán giá Flash Sale & biên lợi nhuận"
                : undefined
            }
            showProgress={
              deptStatus.merchandising.activeAgent === "pricing_strategist" ||
              marketingActiveAgent === "pricing_strategist" ||
              marketingActiveAgent === "merchandising_clearance_calc"
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
              <p className="ccWaitingCardPrompt">"{pendingHandoff.prompt}"</p>
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
              <p className="ccWaitingCardPrompt">"{task.prompt}"</p>
              <div className="ccWaitingCardResource">
                <span className="ccWaitingDot" />
                <span>
                  Đang đợi {task.waitingForResource?.agentName || "nhân sự phối hợp"} hoàn tất việc...
                </span>
              </div>
            </div>
          ))}

          {campaignProposal && (
            <button
              type="button"
              className="ccOperationsQuickBtn"
              style={{ marginTop: "0.25rem", width: "100%", justifyContent: "center", padding: "0.45rem 0.6rem", borderColor: "rgba(6, 182, 212, 0.4)", color: "#22d3ee" }}
              onClick={() => setCampaignProposalModalOpen(true)}
            >
              <Sparkles size={14} color="#06b6d4" />
              <span>Xem Đề Xuất Chiến Dịch ({campaignProposal.items.length} SP)</span>
            </button>
          )}

          <DepartmentInput
            placeholder="Giao việc cho Danh mục & Định giá..."
            theme="cyan"
            onSend={(text) => handleDepartmentDirectTask("merchandising", text)}
          />
        </div>

        {/* Column 3: Vận hành & Kho (Amber Theme) */}
        <div id="dept-column-operations" className="ccDepartmentColumn theme-amber">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <div className="ccDeptIconBadge">
                <ShoppingBag size={16} />
              </div>
              <span>Vận hành & Kho</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {pendingReplenishment && pendingReplenishment.items.length > 0 && (
                <span className="ccReplenishmentAlertBadge" title="Đề xuất nhập kho tự động từ AI">
                  ⚡ Đề xuất nhập kho AI: {pendingReplenishment.items.length} SKU
                </span>
              )}
              {departmentQueues.operations.length > 0 && (
                <span className="ccDeptQueueBadge">
                  <Clock size={11} className="ccSpinSlow" />
                  <span>Hàng chờ: {departmentQueues.operations.length}</span>
                </span>
              )}
              <span className="ccDeptCountBadge">
                <span className="ccPillDot" style={{ width: 6, height: 6, background: "#fbbf24" }} />
                <span>2 Nhân sự</span>
              </span>
            </div>
          </div>

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
            roleTag="ĐỘI"
            theme="amber"
            status={
              deptStatus.operations.activeAgent === "order_coordinator" ||
              marketingActiveAgent === "order_coordinator"
                ? "running"
                : deptStatus.operations.completedAgents.includes("order_coordinator") ||
                  operationsProposal ||
                  getBranchState("order") === "completed"
                ? "completed"
                : getBranchState("order")
            }
            statusText={
              deptStatus.operations.activeAgent === "order_coordinator"
                ? deptStatus.operations.agentMessage ?? "Đang tính toán tốc độ luân chuyển & dự toán ngân sách..."
                : marketingActiveAgent === "order_coordinator"
                ? marketingAgentMessage ?? "Đang tính toán tốc độ luân chuyển & dự toán ngân sách..."
                : deptStatus.operations.completedAgents.includes("order_coordinator") || operationsProposal
                ? "Đã lập phiếu đề xuất nhập kho và ngân sách dự toán"
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
              <p className="ccWaitingCardPrompt">"{task.prompt}"</p>
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

          {pendingReplenishment && (
            <div className="ccOperationsAlertCard">
              <div className="ccOperationsAlertHeader">
                <AlertTriangle size={15} color="#f59e0b" className="ccGlowIcon" />
                <span className="ccOperationsAlertTitle">
                  🚨 Phát hiện {pendingReplenishment.items.length} mặt hàng sắp cạn kiệt
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
          )}

          <DepartmentInput
            placeholder="Giao việc cho Vận hành & Kho..."
            theme="amber"
            onSend={(text) => handleDepartmentDirectTask("operations", text)}
          />
        </div>

        {/* Column 4: CSKH & Cộng đồng (Emerald Theme) */}
        <div id="dept-column-support" className="ccDepartmentColumn theme-emerald">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <div className="ccDeptIconBadge">
                <Headphones size={16} />
              </div>
              <span>CSKH & Cộng đồng</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {departmentQueues.support.length > 0 && (
                <span className="ccDeptQueueBadge">
                  <Clock size={11} className="ccSpinSlow" />
                  <span>Hàng chờ: {departmentQueues.support.length}</span>
                </span>
              )}
              <span className="ccDeptCountBadge">
                <span className="ccPillDot" style={{ width: 6, height: 6, background: "#34d399" }} />
                <span>2 Nhân sự</span>
              </span>
            </div>
          </div>

          <AgentCard
            name="Quản gia CSKH"
            roleTag="TRỢ LÝ"
            theme="emerald"
            status={
              deptStatus.support.activeAgent === "support_steward" ||
              marketingActiveAgent === "support_steward"
                ? "running"
                : deptStatus.support.completedAgents.includes("support_steward") ||
                  marketingActiveAgent === "crm_specialist" ||
                  supportProposal ||
                  getBranchState("support") === "completed"
                ? "completed"
                : getBranchState("support")
            }
            statusText={
              deptStatus.support.activeAgent === "support_steward"
                ? deptStatus.support.agentMessage ?? "Đang rà soát ticket sự cố và đánh giá tâm lý..."
                : marketingActiveAgent === "support_steward"
                ? marketingAgentMessage ?? "Đang rà soát ticket sự cố và đánh giá tâm lý..."
                : deptStatus.support.completedAgents.includes("support_steward") || supportProposal
                ? "Đã rà soát và đánh giá mức độ khẩn cấp ticket CSKH"
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
                  supportProposal ||
                  getBranchState("crm") === "completed"
                ? "completed"
                : getBranchState("crm")
            }
            statusText={
              deptStatus.support.activeAgent === "crm_specialist"
                ? deptStatus.support.agentMessage ?? "Đang phân khúc VIP & dự toán voucher..."
                : marketingActiveAgent === "crm_specialist"
                ? marketingAgentMessage ?? "Đang phân khúc VIP & dự toán voucher..."
                : deptStatus.support.completedAgents.includes("crm_specialist") || supportProposal
                ? "Đã phân khúc VIP và đề xuất giải pháp xử lý"
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
              <p className="ccWaitingCardPrompt">"{task.prompt}"</p>
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

          <DepartmentInput
            placeholder="Giao việc cho CSKH & CRM..."
            theme="emerald"
            onSend={(text) => handleDepartmentDirectTask("support", text)}
          />
        </div>
      </div>

      {/* 6. Live Executive Report Output when Orchestration is available */}
      {executiveReportData && (
        <div style={{ marginTop: "2rem" }}>
          <ExecutiveReport report={executiveReportData} workflowState={currentOrchestrationState} />
        </div>
      )}

      {/* 7. Multi-Modal Campaign Proposal Review Modal with Pagination */}
      {campaignProposalModalOpen && campaignProposal && (
        <CampaignProposalModal
          proposal={campaignProposal}
          onClose={() => setCampaignProposalModalOpen(false)}
          onApprove={handleApproveCampaign}
          isActivating={isActivatingCampaign}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {/* 8. Social Token Health & Manager Modal */}
      <SocialTokenManagerModal
        isOpen={socialTokenModalOpen}
        onClose={() => setSocialTokenModalOpen(false)}
        summary={socialTokensSummary}
        onRefreshAccount={handleRefreshSocialAccount}
        onCheckTokens={handleCheckSocialTokens}
        onUpdateToken={handleUpdateSocialToken}
        onSyncEnv={handleSyncSocialTokensEnv}
        onOAuthReconnect={handleOAuthReconnect}
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
