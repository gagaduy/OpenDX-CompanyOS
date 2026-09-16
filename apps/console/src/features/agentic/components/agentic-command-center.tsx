// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef, Fragment, useCallback, useMemo } from "react";
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
  Mail,
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
  Flame,
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
import type { AgenticTaskOverview, AgenticTaskPage, AgenticTaskOperations, AgenticApproval, CommandActivityEvent, CreateCommandActivity } from "../types/agentic.types";
import type {
  MarketingApi,
  SocialTokensSummaryView,
} from "../../marketing/api/marketing-api";
import type { MarketingCampaignDetail, MarketingCampaign, MarketingArtifact } from "../../marketing/types";
import { SocialTokenManagerModal } from "../../marketing/components/social-token-manager-modal";
import { MarketingCampaignModal } from "../../marketing/components/marketing-campaign-modal";
import type { CatalogApi, MerchandisingProposal, CampaignProposal, ActiveCampaign } from "../../catalog/api/catalog-api";
import { CampaignProposalModal, resolveMediaUrl } from "../../catalog/components/campaign-proposal-modal";
import { ActiveCampaignWidget } from "../../catalog/components/active-campaign-widget";
import type { InventoryApi } from "../../inventory/api/inventory-api";
import { OperationsProposalModal } from "../../inventory/components/operations-proposal-modal";
import type { OperationsProposal, OperationsProposalItem } from "../../inventory/types/inventory.types";
import type { SupportOperationsApi } from "../../support/api/support-api";
import type {
  AiSupportProposalView,
  SupportEmailCampaignProposalView,
} from "../../support/types/support.types";
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
import { DepartmentDiagnosticsModal } from "./command-center/department-diagnostics-modal";
import { StrategicDeliverableModal } from "./command-center/strategic-deliverable-modal";
import { SupportEmailApprovalModal } from "./command-center/support-email-approval-modal";
import { SupportEmailCampaignApprovalModal } from "./command-center/support-email-campaign-approval-modal";
import {
  buildStrategicDeliverable,
  downloadDeliverableDocx,
  type StrategicDeliverable,
} from "../types/strategic-deliverable.types";
import type {
  DepartmentCardProps,
  LiveEventItem,
  PendingApprovalItem,
  TaskFilterType,
  CommandComposerSubmitMeta,
} from "./command-center/types";
import "../styles/agentic-command-center.css";
import "../styles/command-center-redesign.css";

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

const LIVE_EVENTS_PER_DEPARTMENT = 30;

function retainRecentLiveEvents(events: readonly LiveEventItem[]): readonly LiveEventItem[] {
  const counts = new Map<LiveEventItem["department"], number>();
  return [...events]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .filter((event) => {
      const count = counts.get(event.department) ?? 0;
      if (count >= LIVE_EVENTS_PER_DEPARTMENT) return false;
      counts.set(event.department, count + 1);
      return true;
    });
}

function buildFallbackMarketingDetail(camp: MarketingCampaign): MarketingCampaignDetail {
  const artifacts: MarketingArtifact[] = [
    {
      id: `art-brief-${camp.id}`,
      campaignId: camp.id,
      kind: "campaign_brief_docx",
      filename: `campaign-brief-${camp.id.slice(0, 8)}.docx`,
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteSize: 18432,
      sha256Digest: "sha256:brief-digest",
      storageKey: `marketing/${camp.id}/brief.docx`,
      createdAt: camp.createdAt || new Date().toISOString(),
    },
    {
      id: `art-copy-${camp.id}`,
      campaignId: camp.id,
      kind: "facebook_content_docx",
      filename: `facebook-content-${camp.id.slice(0, 8)}.docx`,
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteSize: 15360,
      sha256Digest: "sha256:content-digest",
      storageKey: `marketing/${camp.id}/content.docx`,
      createdAt: camp.createdAt || new Date().toISOString(),
    },
    {
      id: `art-visual-${camp.id}`,
      campaignId: camp.id,
      kind: "facebook_visual_png",
      filename: `facebook-visual-${camp.id.slice(0, 8)}.png`,
      mediaType: "image/png",
      byteSize: 2108723,
      sha256Digest: "sha256:visual-digest",
      storageKey: `marketing/${camp.id}/visual.png`,
      createdAt: camp.createdAt || new Date().toISOString(),
    },
    {
      id: `art-log-${camp.id}`,
      campaignId: camp.id,
      kind: "facebook_publication_log_xlsx",
      filename: `publication-log-${camp.id.slice(0, 8)}.xlsx`,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteSize: 12288,
      sha256Digest: "sha256:log-digest",
      storageKey: `marketing/${camp.id}/publication-log.xlsx`,
      createdAt: camp.createdAt || new Date().toISOString(),
    },
    {
      id: `art-report-${camp.id}`,
      campaignId: camp.id,
      kind: "marketing_final_report_pdf",
      filename: `marketing-final-report-${camp.id.slice(0, 8)}.pdf`,
      mediaType: "application/pdf",
      byteSize: 34816,
      sha256Digest: "sha256:report-digest",
      storageKey: `marketing/${camp.id}/final-report.pdf`,
      createdAt: camp.createdAt || new Date().toISOString(),
    },
  ];

  const defaultBody =
    "Cuối tuần rồi, bạn đã sẵn sàng săn DEAL KHỦNG chưa? 💥 NovaCommerce mang đến 'Siêu Sale Cuối Tuần' với hàng ngàn sản phẩm từ công nghệ, thời trang đến đồ gia dụng,... GIẢM GIÁ SỐC CHƯA TỪNG CÓ! 🤩\n\n🎯 ĐỪNG BỎ LỠ cơ hội vàng để sắm sửa những món đồ yêu thích với mức giá không tưởng. Chất lượng đỉnh cao, giá cả cực mềm - chỉ có tại NovaCommerce! 🛍️\n\n🎁 Đặc biệt, hàng trăm QUÀ TẶNG BẤT NGỜ đang chờ đợi những khách hàng may mắn nhất! 🎁";

  return {
    campaign: camp,
    brief: {
      id: `brief-${camp.id}`,
      campaignId: camp.id,
      campaignName: camp.campaignName || "Chiến dịch Tiếp thị & Truyền thông Sáng tạo",
      objective:
        camp.objective ||
        "Quảng bá sản phẩm và kích cầu doanh số theo chỉ đạo CEO: Soạn thảo nội dung quảng bá và chiến dịch content tiếp thị cho sự kiện Siêu Sale Cuối Tuần trên mạng xã hội Facebook để tăng tương tác và chuyển đổi khách hàng",
      subjectKind: "free_topic",
      subjectReference: camp.campaignName || "Chiến dịch Marketing Fanpage",
      language: "vi",
      mandatoryMessage: camp.mandatoryMessage || "Ưu đãi đặc quyền dành riêng cho khách hàng",
      prohibitedClaims: [],
      callToAction: "Xem ngay ưu đãi hôm nay!",
      facebookPageConfigurationId: "default",
      scheduledFor: camp.createdAt || new Date().toISOString(),
      deadline: camp.updatedAt || new Date().toISOString(),
      approverId: "human_approver",
      maximumCostMicros: 1000000,
      provenance: [],
      version: camp.version || 1,
      createdAt: camp.createdAt || new Date().toISOString(),
    },
    contentVersions: [
      {
        id: `content-${camp.id}`,
        campaignId: camp.id,
        versionNumber: 1,
        hook: "🔥 BÙNG NỔ ƯU ĐÃI ĐẶC QUYỀN HÔM NAY!",
        headline: camp.campaignName || "Chiến dịch Tiếp thị & Truyền thông Sáng tạo",
        body: camp.mandatoryMessage || defaultBody,
        callToAction: "👉 Nhắn tin ngay cho Fanpage để nhận mã giảm giá giới hạn!",
        hashtags: ["#OpenDX", "#CompanyOS", "#SieuSaleCuoiTuan", "#NovaCommerce", "#GiamGiaSoc"],
        factualClaimSourceIds: [],
        contentDigest: "sha256:fallback",
        costMicros: 0,
        createdAt: camp.createdAt || new Date().toISOString(),
      },
    ],
    visualAssets: [
      {
        id: `visual-${camp.id}`,
        campaignId: camp.id,
        versionNumber: 1,
        aspectRatio: "1:1",
        width: 1024,
        height: 1024,
        mediaType: "image/png",
        byteSize: 2108723,
        imageDigest: "sha256:visual-digest",
        altText: camp.campaignName || "Poster Đồ họa Siêu Sale Cuối Tuần (1024x1024)",
        storageKey: `marketing/${camp.id}/visual.png`,
        costMicros: 0,
        createdAt: camp.createdAt || new Date().toISOString(),
      },
    ],
    publicationPackages: [],
    currentPackage: null,
    publicationAttempts: [],
    publicationRecord: null,
    publicationRecords: [],
    artifacts,
  };
}

function buildCampaignProposalFromMerchandising(prop: MerchandisingProposal): CampaignProposal {
  const items = (prop.items || []).map((it, idx) => ({
    id: `item-${it.targetProductId || it.targetVariantId || idx}`,
    productId: it.targetProductId || `prod-${idx}`,
    variantId: it.targetVariantId || `var-${idx}`,
    productName: it.productName || "Sản phẩm Flash Sale",
    productSlug: it.productSlug || `flash-sale-${idx}`,
    originalPriceVnd: it.originalPriceVnd || 100000,
    campaignPriceVnd: it.proposedPriceVnd || Math.round((it.originalPriceVnd || 100000) * 0.85),
    discountPercent: it.discountPercent || 15,
    savingAmountVnd: it.savingAmountVnd || Math.round((it.originalPriceVnd || 100000) * 0.15),
    originalMediaUrl: it.originalMediaUrl,
    campaignMediaUrl: it.campaignMediaUrl,
    optimizedTitle: it.optimizedTitle || it.productName || "Sản phẩm ưu đãi",
    optimizedDescription: it.optimizedDescription || "Chiến dịch định giá ưu đãi",
    badge: it.badge || "HOT SALE",
  }));

  const now = new Date();
  const endDate = new Date(Date.now() + 86400000 * 3);

  return {
    id: prop.id,
    name: prop.prompt || "Đề xuất Flash Sale & Tối ưu Danh mục",
    slug: "flash-sale-de-xuat",
    prompt: prop.prompt || "Chiến dịch định giá và tối ưu danh mục hàng hóa",
    themeKey: "flash_sale",
    badgeText: "HOT DEAL",
    discountPercent: 15,
    startTime: now.toISOString(),
    endTime: endDate.toISOString(),
    durationDays: 3,
    status: "draft",
    items,
    totalProducts: items.length,
    pricingRationale: prop.pricingRationale || "Tối ưu hóa lợi nhuận dựa trên dữ liệu nhu cầu thị trường",
    salesProjection: prop.salesProjection || "Dự kiến tăng 25% doanh số trong thời gian áp dụng",
  };
}

function activityResourceType(department: DepartmentType): CreateCommandActivity["resourceType"] {
  const resources: Record<DepartmentType, CreateCommandActivity["resourceType"]> = {
    marketing: "marketing_campaign",
    merchandising: "merchandising_proposal",
    operations: "operations_proposal",
    support: "support_proposal",
  };
  return resources[department];
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

  // Smooth scroll to targeted department or task with pulse animation
  const scrollToDepartment = (target: string, taskId?: string) => {
    setTimeout(() => {
      const taskEl = taskId ? document.getElementById(`dept-task-${taskId}`) : null;
      const deptId = target.startsWith("dept-")
        ? target
        : `dept-column-${target === "ai_ceo" ? "operations" : target}`;
      const deptEl = document.getElementById(deptId);
      const el = taskEl || deptEl;
      if (el) {
        el.scrollIntoView?.({ behavior: "smooth", block: "center" });
        if (deptEl) {
          deptEl.classList.remove("highlight-pulse");
          deptEl.classList.remove("ccDeptHighlightGlow");
          void deptEl.offsetWidth;
          deptEl.classList.add("highlight-pulse");
          deptEl.classList.add("ccDeptHighlightGlow");
          setTimeout(() => {
            deptEl.classList.remove("highlight-pulse");
            deptEl.classList.remove("ccDeptHighlightGlow");
          }, 3600);
        }
      }
    }, 60);
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
  const [previewCampaignDetail, setPreviewCampaignDetail] = useState<MarketingCampaignDetail | null>(null);
  const [campaignsList, setCampaignsList] = useState<readonly MarketingCampaign[]>([]);
  const [marketingActionLoading, setMarketingActionLoading] = useState(false);
  const [revisionInput, setRevisionInput] = useState("");
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [marketingCampaignModalOpen, setMarketingCampaignModalOpen] = useState(false);

  // Completed Tasks Reviewed Acknowledgment State
  const [reviewedTaskIds, setReviewedTaskIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const stored = localStorage.getItem("opendx_reviewed_task_ids");
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const markTaskReviewed = (taskId: string) => {
    setReviewedTaskIds((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      try {
        localStorage.setItem("opendx_reviewed_task_ids", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Canceled Marketing Campaigns State (Dismissed / Excluded from Pending Approvals)
  const [canceledCampaignIds, setCanceledCampaignIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const stored = localStorage.getItem("opendx_canceled_campaign_ids");
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const canceledCampaignIdsRef = useRef(canceledCampaignIds);
  canceledCampaignIdsRef.current = canceledCampaignIds;

  const markCampaignCanceled = (campaignId: string) => {
    setCanceledCampaignIds((prev) => {
      const next = new Set(prev);
      next.add(campaignId);
      try {
        localStorage.setItem("opendx_canceled_campaign_ids", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

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
      const durationText = refreshed.expiresInHuman || (refreshed.daysRemaining !== null ? `${refreshed.daysRemaining} ngày` : "vĩnh viễn");
      const successText = `⚡ Đã tự động gia hạn token cho ${platform === "facebook" ? "Facebook Fanpage" : "Instagram"} (${refreshed.accountName || accountId}) thành công! Hạn dùng: ${durationText}.`;
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
      if (marketingApi.getSocialTokensStatus) {
        const updated = await marketingApi.getSocialTokensStatus().catch(() => null);
        if (updated) setSocialTokensSummary(updated);
      }
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
  const [activeCampaigns, setActiveCampaigns] = useState<readonly ActiveCampaign[]>([]);
  const [campaignProposal, setCampaignProposal] = useState<CampaignProposal | null>(null);
  const [viewingCampaignProposal, setViewingCampaignProposal] = useState<CampaignProposal | null>(null);
  const [isCampaignModalReadOnly, setIsCampaignModalReadOnly] = useState(false);
  const campaignProposalsCache = useRef<Record<string, CampaignProposal>>({});
  const [campaignProposalModalOpen, setCampaignProposalModalOpen] = useState(false);
  const [isActivatingCampaign, setIsActivatingCampaign] = useState(false);
  const [isRevertingCampaign, setIsRevertingCampaign] = useState(false);
  const [activeCampaignScrollIndex, setActiveCampaignScrollIndex] = useState(0);
  const activeCampaignsScrollRef = useRef<HTMLDivElement>(null);

  const handleOpenCampaignDeliverable = async (campaignId?: string, readOnly = true) => {
    setIsCampaignModalReadOnly(readOnly);
    if (!campaignId) {
      if (campaignProposal) {
        setViewingCampaignProposal(campaignProposal);
        setCampaignProposalModalOpen(true);
      }
      return;
    }

    if (campaignProposal && campaignProposal.id === campaignId) {
      setViewingCampaignProposal(campaignProposal);
      setCampaignProposalModalOpen(true);
      return;
    }

    if (campaignProposalsCache.current[campaignId]) {
      setViewingCampaignProposal(campaignProposalsCache.current[campaignId]!);
      setCampaignProposalModalOpen(true);
      return;
    }

    if (catalogApi?.getCampaign) {
      try {
        const fetched = await catalogApi.getCampaign(campaignId);
        if (fetched) {
          campaignProposalsCache.current[campaignId] = fetched;
          setViewingCampaignProposal(fetched);
          setCampaignProposalModalOpen(true);
          return;
        }
      } catch (e) {
        console.warn("[CampaignProposal] Could not fetch campaign by id:", e);
      }
    }

    const targetCamp = activeCampaigns.find((c) => c.id === campaignId) || activeCampaign;
    if (targetCamp) {
      const deliv = buildStrategicDeliverable(targetCamp.name, targetCamp.id, "merchandising");
      setSelectedStrategicDeliverable(deliv);
      setIsStrategicModalOpen(true);
    }
  };

  const displayedActiveCampaigns = useMemo(() => {
    return activeCampaigns && activeCampaigns.length > 0
      ? activeCampaigns
      : activeCampaign ? [activeCampaign] : [];
  }, [activeCampaigns, activeCampaign]);

  useEffect(() => {
    if (catalogApi) {
      void catalogApi.getActiveCampaign().then((res) => {
        setActiveCampaign(res);
        if (res?.activeCampaigns && res.activeCampaigns.length > 0) {
          setActiveCampaigns(res.activeCampaigns);
        } else if (res) {
          setActiveCampaigns([res]);
        } else {
          setActiveCampaigns([]);
        }
      }).catch(console.error);
    }
  }, [catalogApi]);

  // Safeguard: if campaign proposal modal is requested but neither campaignProposal nor viewingCampaignProposal is present,
  // automatically fallback to StrategicDeliverableModal with activeCampaign deliverable
  useEffect(() => {
    if (campaignProposalModalOpen && !campaignProposal && !viewingCampaignProposal) {
      if (activeCampaign) {
        const deliv = buildStrategicDeliverable(activeCampaign.name, activeCampaign.id, "merchandising");
        setSelectedStrategicDeliverable(deliv);
        setIsStrategicModalOpen(true);
      }
      setCampaignProposalModalOpen(false);
    }
  }, [campaignProposalModalOpen, campaignProposal, viewingCampaignProposal, activeCampaign]);

  // Operations / Inventory Restock State
  const [operationsProposal, setOperationsProposal] = useState<OperationsProposal | null>(null);
  const [pendingReplenishment, setPendingReplenishment] = useState<OperationsProposal | null>(null);
  const [isOperationsModalOpen, setIsOperationsModalOpen] = useState(false);
  const [operationsActionLoading, setOperationsActionLoading] = useState(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [operationsPage, setOperationsPage] = useState(1);

  useEffect(() => {
    if (!inventoryApi?.getPendingReplenishment) return;
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
  const [isSupportEmailApprovalModalOpen, setIsSupportEmailApprovalModalOpen] = useState(false);
  const [isDownloadingSupportDocx, setIsDownloadingSupportDocx] = useState(false);
  const [supportTicketsPage, setSupportTicketsPage] = useState(1);
  const [supportVipPage, setSupportVipPage] = useState(1);

  useEffect(() => {
    if (!supportApi?.getLatestSupportProposal) return;
    const controller = new AbortController();
    void supportApi
      .getLatestSupportProposal(controller.signal)
      .then((proposal) => {
        if (proposal && proposal.status !== "canceled") {
          setSupportProposal((current) => current ?? proposal);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Failed to hydrate latest Support proposal:", error);
        }
      });
    return () => controller.abort();
  }, [supportApi]);

  // Proactive Cross-Department Support Email Campaign State
  const [supportCampaignProposal, setSupportCampaignProposal] = useState<SupportEmailCampaignProposalView | null>(null);
  const [isSupportCampaignModalOpen, setIsSupportCampaignModalOpen] = useState(false);
  const [isSupportCampaignSubmitting, setIsSupportCampaignSubmitting] = useState(false);

  useEffect(() => {
    if (!supportApi?.listEmailCampaignProposals) return;
    const controller = new AbortController();
    void supportApi
      .listEmailCampaignProposals({ limit: 1 }, controller.signal)
      .then((proposals) => {
        if (proposals && proposals.length > 0) {
          const latest = proposals[0];
          if (latest && latest.status !== "rejected") {
            setSupportCampaignProposal((current) => current ?? latest);
          }
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Failed to hydrate latest Support email campaign proposal:", error);
        }
      });
    return () => controller.abort();
  }, [supportApi]);

  // Strategic AI CEO Deliverable State
  const [completedStrategicDeliverable, setCompletedStrategicDeliverable] = useState<StrategicDeliverable | null>(null);
  const [isStrategicModalOpen, setIsStrategicModalOpen] = useState(false);
  const [selectedStrategicDeliverable, setSelectedStrategicDeliverable] = useState<StrategicDeliverable | null>(null);
  const [strategicDeliverableApproved, setStrategicDeliverableApproved] = useState(false);
  const [focusedApprovalId, setFocusedApprovalId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusedApprovalId) return;

    document
      .getElementById(`pending-approval-${focusedApprovalId}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });

    const timer = window.setTimeout(() => setFocusedApprovalId(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [focusedApprovalId]);

  // Live Feed & Approvals Dynamic State
  const [apiApprovals, setApiApprovals] = useState<readonly AgenticApproval[]>([]);

  const refreshApprovals = useCallback(async (signal?: AbortSignal) => {
    if (!api?.listApprovals) return;
    try {
      const res = await api.listApprovals(1, 20, signal);
      if (res?.items) {
        const now = Date.now();
        setApiApprovals(
          res.items.filter(
            (a) => a.state === "pending" && (!a.expiresAt || new Date(a.expiresAt).getTime() > now)
          )
        );
      }
    } catch {
      // safe fallback if listApprovals is not implemented or mock returns void
    }
  }, [api]);

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
  const [analysisStep, setAnalysisStep] = useState<number>(0);
  const [marketingActiveAgent, setMarketingActiveAgent] = useState<string | null>(null);
  const [marketingAgentMessage, setMarketingAgentMessage] = useState<string | null>(null);

  // Active Cross-Department Collaboration Bridge ("Sợi dây kết nối")
  const [activeCollaboration, setActiveCollaboration] = useState<ActiveCollaboration | null>(null);
  const departmentsGridRef = useRef<HTMLDivElement | null>(null);
  const workforceColumnRef = useRef<HTMLDivElement | null>(null);
  const liveFeedContainerRef = useRef<HTMLDivElement | null>(null);
  const [approvalsScrollMaxHeight, setApprovalsScrollMaxHeight] = useState<number>(440);

  useEffect(() => {
    const updateApprovalsHeight = () => {
      if (typeof window !== "undefined" && window.innerWidth <= 1200) {
        setApprovalsScrollMaxHeight(420);
        return;
      }
      if (!workforceColumnRef.current) return;
      const workforceH = workforceColumnRef.current.offsetHeight;
      const liveFeedH = liveFeedContainerRef.current ? liveFeedContainerRef.current.offsetHeight : 340;
      // Gap between liveFeed and approvals is 16px (1rem), approvals card padding and header overhead is ~76px
      const targetScrollH = workforceH - liveFeedH - 16 - 76;
      if (targetScrollH > 180) {
        setApprovalsScrollMaxHeight(Math.round(targetScrollH));
      } else {
        setApprovalsScrollMaxHeight(420);
      }
    };

    updateApprovalsHeight();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateApprovalsHeight();
      });
      if (workforceColumnRef.current) ro.observe(workforceColumnRef.current);
      if (liveFeedContainerRef.current) ro.observe(liveFeedContainerRef.current);
    }
    window.addEventListener("resize", updateApprovalsHeight);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", updateApprovalsHeight);
    };
  }, []);

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

  // Prominent Completion Toast Notification
  const [completionToast, setCompletionToast] = useState<{
    readonly id: string;
    readonly title: string;
    readonly department: "ai_ceo" | DepartmentType;
    readonly departmentName: string;
    readonly goal: string;
    readonly deliverable: StrategicDeliverable;
    readonly timestamp: string;
  } | null>(null);
  const completionToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const strategicAbortRef = useRef<AbortController | null>(null);

  const interruptibleDelay = useCallback((ms: number) => {
    return new Promise<void>((resolve, reject) => {
      const signal = strategicAbortRef.current?.signal;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(() => {
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (completionToastTimerRef.current) {
        clearTimeout(completionToastTimerRef.current);
      }
      if (strategicAbortRef.current) {
        strategicAbortRef.current.abort();
      }
    };
  }, []);

  const notifyAndShowStrategicDeliverable = useCallback(
    (
      goalText: string,
      taskId?: string,
      department?: "ai_ceo" | DepartmentType,
      customSuccessMsg?: string,
      isCampaign?: boolean,
    ) => {
      const deliverable = buildStrategicDeliverable(goalText, taskId, department);
      setCompletedStrategicDeliverable(deliverable);
      setSelectedStrategicDeliverable(deliverable);
      setStrategicDeliverableApproved(false);
      if (department === "support") {
        setIsStrategicModalOpen(false);
        if (isCampaign) {
          setIsSupportEmailApprovalModalOpen(false);
          setIsSupportCampaignModalOpen(true);
        } else {
          setIsSupportCampaignModalOpen(false);
          setIsSupportEmailApprovalModalOpen(true);
        }
      } else {
        setIsStrategicModalOpen(true);
      }
      void refreshApprovals();

      const deptNameMap: Record<DepartmentType | "ai_ceo", string> = {
        ai_ceo: "AI CEO & Điều phối Chiến lược",
        marketing: "Phòng Tiếp thị & Truyền thông Sáng tạo",
        merchandising: "Phòng Kinh doanh & Định giá Danh mục",
        operations: "Phòng Chuỗi cung ứng & Kho vận",
        support: "Phòng CSKH & Trải nghiệm Khách hàng",
      };
      const deptName = deptNameMap[department || "ai_ceo"] || "AI CEO & Điều phối Chiến lược";

      if (completionToastTimerRef.current) {
        clearTimeout(completionToastTimerRef.current);
      }

      setCompletionToast({
        id: deliverable.id,
        title: deliverable.title,
        department: department || "ai_ceo",
        departmentName: deptName,
        goal: goalText,
        deliverable,
        timestamp: new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      });

      completionToastTimerRef.current = setTimeout(() => {
        setCompletionToast(null);
      }, 20000);

      setSuccessMessage(
        customSuccessMsg ||
          `✅ ${deptName} đã hoàn tất tác vụ và lập Báo cáo Chiến lược Word (.docx)! Bấm vào tài liệu để xem chi tiết.`,
      );
    },
    [refreshApprovals],
  );

  const isFbTokenInvalid = Boolean(
    socialTokensSummary?.urgentActionRequired ||
    socialTokensSummary?.accounts.some((a) => a.status === "expired" || a.status === "invalid")
  );
  const isFbTokenWarning = Boolean(
    socialTokensSummary?.hasExpiringOrInvalid ||
    socialTokensSummary?.accounts.some((a) => a.status === "expiring_soon")
  );

  const [diagnosticsState, setDiagnosticsState] = useState<{
    isOpen: boolean;
    department: DepartmentType;
    departmentName: string;
    errorMessage: string;
    timestamp?: number;
    specialActionLabel?: string;
    onSpecialAction?: () => void;
  }>({
    isOpen: false,
    department: "operations",
    departmentName: "Vận hành & Kho",
    errorMessage: "",
  });

  const handleOpenDiagnostics = (dept: DepartmentType, customMsg?: string) => {
    const names: Record<DepartmentType, string> = {
      marketing: "Phòng Tiếp thị & Sáng tạo",
      merchandising: "Phòng Danh mục & Định giá",
      operations: "Phòng Vận hành & Kho vận",
      support: "Phòng CSKH & Trải nghiệm",
    };
    const defaultMsgs: Record<DepartmentType, string> = {
      marketing: ((activeWorkflowKind === "marketing" || activeWorkflowKind === "orchestration") && errorMessage)
        ? errorMessage
        : (isFbTokenInvalid ? "Token kết nối Facebook Page đã hết hạn hoặc không có quyền publish_pages." : "Ngoại lệ trong quá trình khởi tạo và xuất bản nội dung chiến dịch."),
      merchandising: ((activeWorkflowKind === "merchandising" || activeWorkflowKind === "orchestration") && errorMessage)
        ? errorMessage
        : "Ngoại lệ khi tính toán ma trận biên lợi nhuận hoặc phân bổ mức giá Flash Sale.",
      operations: errorMessage || "Cảnh báo dữ liệu tồn kho an toàn SKU hoặc lệch định mức điều phối.",
      support: ((activeWorkflowKind === "support" || activeWorkflowKind === "orchestration") && errorMessage)
        ? errorMessage
        : "Không thể kết nối dịch vụ đối soát ngân sách tài chính hoặc luồng hỗ trợ khách hàng.",
    };

    const msg = customMsg || defaultMsgs[dept];
    const isSocial = dept === "marketing" && (isFbTokenInvalid || isFbTokenWarning);

    setDiagnosticsState({
      isOpen: true,
      department: dept,
      departmentName: names[dept],
      errorMessage: msg,
      timestamp: Date.now(),
      specialActionLabel: isSocial ? "Mở Quản lý Social Tokens" : dept === "operations" && pendingReplenishment ? "Mở Phiếu Đề Xuất Kho" : undefined,
      onSpecialAction: isSocial
        ? () => setSocialTokenModalOpen(true)
        : dept === "operations" && pendingReplenishment
        ? () => {
            setOperationsProposal(pendingReplenishment);
            setIsOperationsModalOpen(true);
          }
        : undefined,
    });
  };

  const [visualBlobUrl, setVisualBlobUrl] = useState<string | null>(null);

  // Load initial marketing campaigns list for History and keep pending campaigns fresh
  useEffect(() => {
    if (!marketingApi?.listCampaigns) return;
    let isMounted = true;

    const loadCampaigns = () => {
      marketingApi
        .listCampaigns({ limit: 20 })
        .then((res) => {
          if (!isMounted) return;
          const filtered = res.items.filter(
            (c) => !canceledCampaignIdsRef.current.has(c.id) && c.state !== "canceled",
          );
          setCampaignsList(filtered);
          if (activeCampaignId && canceledCampaignIdsRef.current.has(activeCampaignId)) {
            setActiveCampaignId(null);
            setActiveCampaignDetail(null);
          }
          const pendingCamp = filtered.find((c) =>
            ["awaiting_human_approval", "campaign_review", "draft", "visual_creation", "failed", "partial_failure"].includes(c.state),
          );
          if (pendingCamp && !activeCampaignId) {
            setActiveCampaignId(pendingCamp.id);
            marketingApi
              .getCampaign(pendingCamp.id)
              .then((d) => {
                if (isMounted) setActiveCampaignDetail(d);
              })
              .catch(() => {});
          }
        })
        .catch((err) => console.error("Failed to load marketing campaigns:", err));
    };

    loadCampaigns();
    const interval = setInterval(loadCampaigns, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [marketingApi, activeCampaignId]);

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

  const isCeoPlanRunning = Boolean(ceoPlan?.steps?.some((s) => s.status === "running"));
  const isRunning = activeWorkflowKind === "marketing" ? isMarketingRunning : isOrchestrationRunning;
  const isCurrentlyAnalyzing = isSubmitting || isCeoThinking || isRunning || isCeoPlanRunning;

  useEffect(() => {
    if (!isCurrentlyAnalyzing) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isCurrentlyAnalyzing]);

  // Helper: Intent classifier for AI CEO
  const detectStrategicIntent = (text: string): "marketing" | "merchandising" | "operations" | "support" | "orchestration" => {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    const lower = normalized;

    // 0. Explicit department mentions always outrank overlapping business keywords.
    // Direct inputs add brackets, while AI CEO prompts use natural language.
    if (lower.includes("phòng danh mục") || lower.includes("phòng catalog") || lower.includes("phòng thương mại")) {
      return "merchandising";
    }
    if (lower.includes("phòng tiếp thị") || lower.includes("phòng marketing")) {
      return "marketing";
    }
    if (
      lower.includes("phòng vận hành") ||
      lower.includes("phòng ban vận hành") ||
      lower.includes("phòng kho")
    ) {
      return "operations";
    }
    if (
      lower.includes("phòng cskh") ||
      lower.includes("phòng chăm sóc") ||
      lower.includes("cskh") ||
      lower.includes("chăm sóc khách hàng") ||
      lower.includes("bên cskh") ||
      lower.includes("bộ phận cskh") ||
      lower.includes("đội cskh") ||
      lower.includes("bên chăm sóc")
    ) {
      return "support";
    }

    const isExplicitSocialPublishing =
      lower.includes("đăng bài") ||
      lower.includes("lên facebook") ||
      lower.includes("lên instagram") ||
      lower.includes("lên fanpage") ||
      lower.includes("fanpage") ||
      lower.includes("mạng xã hội") ||
      lower.includes("viết bài") ||
      lower.includes("poster");

    // 0.5. Customer email composition & dispatch actions belong exclusively to Support & CRM,
    // even when referencing new products from catalog or promotions from marketing.
    const isExplicitEmailDispatch =
      /(?:soạn|gửi|bắn|lên|triển khai|chạy)\s+(?:chiến\s*dịch\s+)?(?:email|mail|thư)/i.test(normalized) ||
      /chiến\s*dịch\s+(?:gửi\s+)?(?:email|mail)/i.test(normalized) ||
      /(?:email|mail|thư)\s+(?:cho|tới|đến)\s+(?:toàn bộ|tất cả|mọi|các)?\s*khách/i.test(normalized) ||
      /(?:gửi|soạn|bắn|thông báo).*(?:email|mail).*(?:khách hàng|toàn bộ|tất cả)/i.test(normalized) ||
      /(?:email|mail).*(?:cho|tới|đến).*(?:khách hàng|toàn bộ|tất cả)/i.test(normalized) ||
      lower.includes("soạn mail") ||
      lower.includes("gửi mail") ||
      lower.includes("soạn email") ||
      lower.includes("gửi email") ||
      lower.includes("chiến dịch email") ||
      lower.includes("chiến dịch mail") ||
      lower.includes("bắn mail") ||
      lower.includes("bắn email") ||
      lower.includes("soạn thư") ||
      lower.includes("gửi thư cho khách") ||
      lower.includes("gửi thư tri ân") ||
      lower.includes("gửi thư thông báo") ||
      lower.includes("gửi thư quảng bá");

    if (isExplicitEmailDispatch && !isExplicitSocialPublishing) {
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

  // Live Activity Feed State
  const [liveEvents, setLiveEvents] = useState<readonly LiveEventItem[]>([]);

  const formatLiveEventTimestamp = useCallback((dateInput?: string | number | Date) => {
    const d = dateInput ? new Date(dateInput) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const time = validDate.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const date = validDate.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return {
      time,
      date,
      timestamp: `${time} ${date}`,
      epoch: validDate.getTime(),
    };
  }, []);

  const recordLiveEvent = useCallback((
    dept: DepartmentType | "ai_ceo",
    title: string,
    description: string,
    status: "info" | "success" | "warning" | "error" = "info",
    actionLabel?: string,
    onActionClick?: () => void,
    dateInput?: string | number | Date,
    customId?: string,
  ) => {
    const formatted = formatLiveEventTimestamp(dateInput);
    const newEvent: LiveEventItem = {
      id: customId || `live-ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: formatted.timestamp,
      time: formatted.time,
      date: formatted.date,
      createdAt: formatted.epoch,
      department: dept,
      title,
      description,
      status,
      actionLabel,
      onActionClick,
    };
    setLiveEvents((prev) => {
      const filtered = prev.filter((e) => e.id !== newEvent.id);
      const combined = [newEvent, ...filtered];
      return retainRecentLiveEvents(combined);
    });
  }, [formatLiveEventTimestamp]);

  const displayCommandActivity = useCallback((event: CommandActivityEvent) => {
    const departmentNames: Record<CommandActivityEvent["department"], string> = {
      marketing: "Marketing",
      merchandising: "Danh mục & Định giá",
      operations: "Vận hành",
      support: "CSKH",
    };
    const decisionText = event.decision === "approved" ? "đã được phê duyệt" : "đã hủy duyệt";
    recordLiveEvent(
      event.department,
      `${departmentNames[event.department]} ${decisionText}`,
      event.summary,
      event.decision === "approved" ? "success" : "error",
      undefined,
      undefined,
      event.occurredAt,
      `command-activity-${event.id}`,
    );
  }, [recordLiveEvent]);

  const persistCommandActivity = useCallback(async (input: CreateCommandActivity) => {
    try {
      const boundedInput = { ...input, summary: input.summary.trim().slice(0, 240) };
      const event = await api.recordCommandActivity(
        boundedInput,
        `command-center:${input.resourceType}:${input.resourceId}:${input.decision}`,
      );
      if (event?.decision) {
        displayCommandActivity(event);
      }
      return true;
    } catch (error) {
      console.error("Failed to persist command activity:", error);
      try {
        const recovered = (await api.listCommandActivity()).find((event) =>
          event.department === input.department &&
          event.decision === input.decision &&
          event.resourceType === input.resourceType &&
          event.resourceId === input.resourceId,
        );
        if (recovered?.source === "business_history") {
          displayCommandActivity(recovered);
          return true;
        }
      } catch (recoveryError) {
        console.error("Failed to recover business activity:", recoveryError);
      }
      setErrorMessage("Tác vụ đã hoàn tất nhưng chưa thể đồng bộ vào luồng công việc. Vui lòng tải lại để thử lại.");
      return false;
    }
  }, [api, displayCommandActivity]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const events = await api.listCommandActivity(controller.signal);
        if (!controller.signal.aborted) events.forEach(displayCommandActivity);
      } catch (error) {
        if (!controller.signal.aborted) console.error("Failed to hydrate command activity:", error);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [api, displayCommandActivity]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshApprovals(controller.signal);
    return () => controller.abort();
  }, [refreshApprovals, overview?.pendingApprovals, tasks]);

  useEffect(() => {
    const initialEvents: LiveEventItem[] = [];
    if (tasks?.items && tasks.items.length > 0) {
      const isTaskActive = (t: { state: string; updatedAt?: string; createdAt?: string }) => {
        if (!["department_analysis", "planning", "dispatching", "received", "quality_review", "collaboration", "executive_synthesis", "retrying", "awaiting_human_approval", "awaiting_plan_approval"].includes(t.state)) {
          return false;
        }
        if (t.state.startsWith("awaiting_")) return true;
        const tTime = new Date(t.updatedAt || t.createdAt || 0).getTime();
        return !(tTime > 0 && Date.now() - tTime > 4 * 3600 * 1000);
      };

      const sortedTasks = [...tasks.items].sort((a, b) => {
        const aActive = isTaskActive(a) ? 1 : 0;
        const bActive = isTaskActive(b) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      for (const t of sortedTasks.slice(0, 30)) {
        const intent = detectStrategicIntent(t.goal);
        const dept: DepartmentType | "ai_ceo" = intent === "orchestration" ? "ai_ceo" : intent;
        const deptDisplayMap: Record<DepartmentType | "ai_ceo", string> = {
          marketing: "Tiếp thị & Sáng tạo",
          merchandising: "Danh mục & Định giá",
          operations: "Vận hành & Kho vận",
          support: "CSKH & Trải nghiệm",
          ai_ceo: "AI CEO",
        };
        const deptDisplayName = deptDisplayMap[dept];
        const formattedGoal = t.goal.replace(/^([hH]ãy|[hH]ayx)\s*(lên\s*)?/i, "Lên ").trim();
        const capitalizedGoal = formattedGoal.charAt(0).toUpperCase() + formattedGoal.slice(1);
        const shortGoal = capitalizedGoal.length > 42 ? `${capitalizedGoal.slice(0, 39)}...` : capitalizedGoal;

        let title = `${deptDisplayName} tiếp nhận tác vụ`;
        let description = shortGoal;
        let status: "info" | "success" | "warning" | "error" = "info";
        let actionLabel: string | undefined = undefined;
        let onActionClick: (() => void) | undefined = undefined;

        if (t.state === "completed" || t.state === "ready") {
          title = `${deptDisplayName} đã hoàn tất tác vụ`;
          description = shortGoal;
          status = "success";
          actionLabel = "Xem kết quả";
          onActionClick = () => {
            const deliv = buildStrategicDeliverable(t.goal, t.id, dept);
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          };
        } else if (t.state === "partially_completed") {
          title = `${deptDisplayName} hoàn thành 1 phần`;
          description = `Đã có bản dự thảo sơ bộ: ${shortGoal}`;
          status = "success";
          actionLabel = "Xem kết quả";
          onActionClick = () => {
            const deliv = buildStrategicDeliverable(t.goal, t.id, dept);
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          };
        } else if (t.state === "failed") {
          title = `${deptDisplayName} báo lỗi`;
          description = `Lỗi thực thi: ${shortGoal}`;
          status = "error";
          actionLabel = "Cần xử lý";
          onActionClick = () => navigate(`/agentic/tasks/${t.id}`);
        } else if (t.state === "canceled") {
          title = `${deptDisplayName} đã hủy tác vụ`;
          description = `Tác vụ đã bị hủy: ${shortGoal}`;
          status = "error";
        } else if (t.state === "awaiting_human_approval" || t.state === "awaiting_plan_approval") {
          title = "Chờ phê duyệt";
          description = `Đang chờ CEO phê duyệt đề xuất: ${shortGoal}`;
          status = "warning";
          actionLabel = "Xem đề xuất";
          onActionClick = () => navigate("/agentic/approvals");
        } else if (
          t.state === "department_analysis" ||
          t.state === "planning" ||
          t.state === "dispatching" ||
          t.state === "received" ||
          t.state === "quality_review" ||
          t.state === "collaboration" ||
          t.state === "executive_synthesis" ||
          t.state === "retrying"
        ) {
          const taskTime = new Date(t.updatedAt || t.createdAt || 0).getTime();
          const isStale = taskTime > 0 && Date.now() - taskTime > 4 * 3600 * 1000;
          if (isStale) {
            title = `${deptDisplayName} quá hạn / gián đoạn`;
            description = `Tác vụ gián đoạn: ${shortGoal}`;
            status = "error";
          } else {
            title = `${deptDisplayName} đang xử lý tác vụ`;
            description = `Đang xử lý: ${shortGoal}`;
            status = "info";
          }
        }

        const formatted = formatLiveEventTimestamp(t.updatedAt || t.createdAt);

        initialEvents.push({
          id: `task-ev-${t.id}`,
          timestamp: formatted.timestamp,
          time: formatted.time,
          date: formatted.date,
          createdAt: formatted.epoch,
          department: dept,
          title,
          description,
          status,
          actionLabel,
          onActionClick,
        });
      }
    }
    if (activeOperations?.timeline && activeOperations.timeline.length > 0) {
      for (const ev of activeOperations.timeline.slice(-10)) {
        const formatted = formatLiveEventTimestamp(ev.occurredAt);
        initialEvents.push({
          id: `op-ev-${ev.id}`,
          timestamp: formatted.timestamp,
          time: formatted.time,
          date: formatted.date,
          createdAt: formatted.epoch,
          department: "ai_ceo",
          title: ev.kind === "plan_generated" ? "AI CEO đã phân tích yêu cầu" : `AI CEO: ${ev.kind}`,
          description: ev.state === "completed" ? "Đã tạo kế hoạch và phân bổ cho các phòng ban" : `Trạng thái: ${ev.state}`,
          status: ev.state === "completed" ? "success" : ev.state === "failed" ? "error" : "info",
          actionLabel: ev.state === "completed" ? "Xem kết quả" : undefined,
          onActionClick: ev.state === "completed" ? () => {
            const deliv = buildStrategicDeliverable(activeOperations?.task?.goal || "Kế hoạch Điều hành Chiến lược", ev.id, "ai_ceo");
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          } : undefined,
        });
      }
    }
    const effectiveActiveCampaigns = activeCampaigns.length > 0
      ? activeCampaigns
      : activeCampaign ? [activeCampaign] : [];
    for (const camp of effectiveActiveCampaigns) {
      const formatted = formatLiveEventTimestamp(camp.startTime);
      initialEvents.push({
        id: `camp-ev-${camp.id}`,
        timestamp: formatted.timestamp,
        time: formatted.time,
        date: formatted.date,
        createdAt: formatted.epoch,
        department: "merchandising",
        title: "Kinh doanh đã hoàn tất tác vụ",
        description: `Chiến dịch: ${camp.name}`,
        status: "success",
        actionLabel: "Xem kết quả",
        onActionClick: () => {
          void handleOpenCampaignDeliverable(camp.id, true);
        },
      });
    }
    if (campaignProposal) {
      const formatted = formatLiveEventTimestamp(campaignProposal.startTime || Date.now());
      initialEvents.push({
        id: `proposal-ev-${campaignProposal.id}`,
        timestamp: formatted.timestamp,
        time: formatted.time,
        date: formatted.date,
        createdAt: formatted.epoch,
        department: "merchandising",
        title: "Kinh doanh đã lập đề xuất",
        description: `Đề xuất: ${campaignProposal.name || campaignProposal.prompt}`,
        status: "success",
        actionLabel: "Xem kết quả",
        onActionClick: () => {
          void handleOpenCampaignDeliverable(campaignProposal.id, false);
        },
      });
    }
    if (operationsProposal) {
      const formatted = formatLiveEventTimestamp(operationsProposal.createdAt || Date.now());
      initialEvents.push({
        id: `ops-prop-ev-${operationsProposal.id}`,
        timestamp: formatted.timestamp,
        time: formatted.time,
        date: formatted.date,
        createdAt: formatted.epoch,
        department: "operations",
        title: "Vận hành đã lập đề xuất kho",
        description: operationsProposal.summary || "Đề xuất nhập kho bổ sung hàng an toàn",
        status: "success",
        actionLabel: "Xem kết quả",
        onActionClick: () => {
          const deliv = buildStrategicDeliverable(
            operationsProposal.summary || "Đề xuất nhập kho bổ sung hàng an toàn",
            operationsProposal.id,
            "operations",
          );
          setSelectedStrategicDeliverable(deliv);
          setIsStrategicModalOpen(true);
        },
      });
    }
    if (supportCampaignProposal) {
      const formatted = formatLiveEventTimestamp(supportCampaignProposal.createdAt || Date.now());
      initialEvents.push({
        id: `support-camp-ev-${supportCampaignProposal.id}`,
        timestamp: formatted.timestamp,
        time: formatted.time,
        date: formatted.date,
        createdAt: formatted.epoch,
        department: "support",
        title: (supportCampaignProposal.status === "sent" || supportCampaignProposal.status === "approved")
          ? "CSKH đã gửi chiến dịch email"
          : "CSKH đã lập kế hoạch chiến dịch email",
        description: supportCampaignProposal.title || "Kế hoạch chiến dịch email khách hàng",
        status: "success",
        actionLabel: "Xem kết quả",
        onActionClick: () => {
          setIsSupportEmailApprovalModalOpen(false);
          setIsSupportCampaignModalOpen(true);
        },
      });
    }
    if (supportProposal) {
      const formatted = formatLiveEventTimestamp(supportProposal.createdAt || Date.now());
      initialEvents.push({
        id: `support-prop-ev-${supportProposal.id}`,
        timestamp: formatted.timestamp,
        time: formatted.time,
        date: formatted.date,
        createdAt: formatted.epoch,
        department: "support",
        title: supportProposal.status === "applied"
          ? "CSKH đã gửi email phản hồi"
          : "CSKH đã lập báo cáo CSKH",
        description: supportProposal.overallSentimentSummary || supportProposal.prompt || "Báo cáo kiểm toán ticket CSKH & CRM",
        status: "success",
        actionLabel: "Xem kết quả",
        onActionClick: () => {
          setIsSupportCampaignModalOpen(false);
          setIsSupportEmailApprovalModalOpen(true);
        },
      });
    }
    if (campaignsList && campaignsList.length > 0) {
      for (const camp of campaignsList) {
        const formatted = formatLiveEventTimestamp(camp.updatedAt || camp.createdAt);
        const campTitle = camp.campaignName || camp.objective || "Chiến dịch Marketing Fanpage";
        if (camp.state === "completed") {
          initialEvents.push({
            id: `marketing-camp-${camp.id}`,
            timestamp: formatted.timestamp,
            time: formatted.time,
            date: formatted.date,
            createdAt: formatted.epoch,
            department: "marketing",
            title: "Marketing đã hoàn tất tác vụ",
            description: campTitle,
            status: "success",
            actionLabel: "Xem kết quả",
            onActionClick: () => {
              setActiveCampaignId(camp.id);
              if (marketingApi?.getCampaign) {
                void marketingApi.getCampaign(camp.id).then((d) => {
                  if (d) {
                    setActiveCampaignDetail(d);
                    setPreviewCampaignDetail(d);
                  }
                }).catch(() => {});
              }
              setMarketingCampaignModalOpen(true);
            },
          });
        } else if (camp.state === "awaiting_human_approval" || camp.state === "campaign_review") {
          initialEvents.push({
            id: `marketing-camp-wait-${camp.id}`,
            timestamp: formatted.timestamp,
            time: formatted.time,
            date: formatted.date,
            createdAt: formatted.epoch,
            department: "marketing",
            title: "Marketing chờ phê duyệt",
            description: campTitle,
            status: "warning",
            actionLabel: "Xem đề xuất",
            onActionClick: () => {
              setActiveCampaignId(camp.id);
              if (marketingApi?.getCampaign) {
                void marketingApi.getCampaign(camp.id).then((d) => {
                  if (d) {
                    setActiveCampaignDetail(d);
                    setPreviewCampaignDetail(d);
                  }
                }).catch(() => {});
              }
              setMarketingCampaignModalOpen(true);
            },
          });
        } else if (camp.state === "draft" || camp.state === "content_drafting" || camp.state === "visual_creation") {
          initialEvents.push({
            id: `marketing-camp-run-${camp.id}`,
            timestamp: formatted.timestamp,
            time: formatted.time,
            date: formatted.date,
            createdAt: formatted.epoch,
            department: "marketing",
            title: "Marketing đang xử lý tác vụ",
            description: campTitle,
            status: "info",
          });
        } else if (camp.state === "failed" || camp.state === "partial_failure") {
          initialEvents.push({
            id: `marketing-camp-fail-${camp.id}`,
            timestamp: formatted.timestamp,
            time: formatted.time,
            date: formatted.date,
            createdAt: formatted.epoch,
            department: "marketing",
            title: "Marketing báo lỗi",
            description: `Lỗi xuất bản: ${campTitle}`,
            status: "error",
            actionLabel: "Cần xử lý",
            onActionClick: () => {
              setActiveCampaignId(camp.id);
              setMarketingCampaignModalOpen(true);
            },
          });
        }
      }
    }
    if (initialEvents.length > 0) {
      setLiveEvents((prevEvents) => {
        const map = new Map<string, LiveEventItem>();
        for (const ev of initialEvents) {
          map.set(ev.id, ev);
        }
        for (const prev of prevEvents) {
          const existing = map.get(prev.id);
          if (!existing) {
            map.set(prev.id, prev);
          } else if ((prev.createdAt || 0) > (existing.createdAt || 0)) {
            map.set(prev.id, prev);
          } else if (prev.status === "success" && existing.status !== "success") {
            map.set(prev.id, {
              ...existing,
              status: "success",
              title: prev.title,
              actionLabel: prev.actionLabel || existing.actionLabel,
              onActionClick: prev.onActionClick || existing.onActionClick,
            });
          }
        }
        return retainRecentLiveEvents(Array.from(map.values()));
      });
    }
  }, [tasks, activeOperations, activeCampaign, activeCampaigns, campaignProposal, operationsProposal, supportProposal, supportCampaignProposal, campaignsList, marketingApi, formatLiveEventTimestamp, navigate]);

  // Strategic AI CEO Dispatch
  const handleSendStrategicTask = async (
    customGoalOrMeta?: string | CommandComposerSubmitMeta,
    customInstructions?: string,
  ) => {
    const isMeta = typeof customGoalOrMeta === "object" && customGoalOrMeta !== null;
    const goalText = (isMeta ? customGoalOrMeta.prompt || prompt : customGoalOrMeta || prompt).trim();
    if (!goalText || isSubmitting) return;

    const metaTarget = isMeta && customGoalOrMeta.target ? customGoalOrMeta.target : composerTarget;
    const metaPriority = isMeta && customGoalOrMeta.priority ? customGoalOrMeta.priority : composerPriority;

    let enrichedInstructions = customInstructions;
    if (isMeta) {
      const parts: string[] = [];
      if (metaPriority) {
        const priorityLabels: Record<string, string> = {
          low: "Thấp",
          normal: "Vừa",
          high: "Cao",
          urgent: "Khẩn cấp",
        };
        parts.push(`[Độ ưu tiên: ${priorityLabels[metaPriority] || metaPriority}]`);
      }
      if (customGoalOrMeta.context?.trim()) {
        parts.push(`[Bối cảnh kinh doanh: ${customGoalOrMeta.context.trim()}]`);
      }
      if (customGoalOrMeta.goalTarget?.trim()) {
        parts.push(`[Chỉ số KPI mục tiêu: ${customGoalOrMeta.goalTarget.trim()}]`);
      }
      if (customGoalOrMeta.attachments && customGoalOrMeta.attachments.length > 0) {
        const fileNames = customGoalOrMeta.attachments
          .map((f) => `${f.name} (${(f.size / 1024).toFixed(0)} KB)`)
          .join(", ");
        parts.push(`[Tài liệu đính kèm: ${fileNames}]`);
      }
      if (parts.length > 0) {
        enrichedInstructions = `${parts.join("\n")}\n\nRà soát toàn diện và phân tích rủi ro thực tế cho mục tiêu: ${goalText}`;
      }
    }

    let strategicAgents: string[] = [];
    try {
      strategicAbortRef.current = new AbortController();
      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setElapsedSeconds(0);
      setStrategicDeliverableApproved(false);
      setCeoPlan(null);

      // 🧠 Phase 1: AI CEO Progressive 4-Stage Intake & Routing Simulation
      setIsCeoThinking(true);
      setAnalysisStep(1); // 1. Phân tích yêu cầu
      setCeoThinkingText("👑 AI CEO đang phân tích yêu cầu chiến lược...");
      await interruptibleDelay(300);

      setAnalysisStep(2); // 2. Xác định phạm vi & mục tiêu
      setCeoThinkingText("👑 AI CEO đang xác định phạm vi thực hiện & chỉ số mục tiêu...");
      await interruptibleDelay(300);

      const intent = (metaTarget !== "ai_ceo" && ["support", "operations", "merchandising", "marketing"].includes(metaTarget))
        ? (metaTarget as DepartmentType)
        : detectStrategicIntent(goalText);

      setAnalysisStep(3); // 3. Lựa chọn phòng ban phù hợp
      setCeoThinkingText(`👑 AI CEO đã xác định phòng ban phụ trách: ${intent}...`);
      await interruptibleDelay(300);

      setAnalysisStep(4); // 4. Phân công nhân sự AI
      setCeoThinkingText("👑 AI CEO đang phân công nhân sự AI chuyên trách...");
      await interruptibleDelay(300);

      setIsCeoThinking(false);
      const strategicTaskId = crypto.randomUUID();
      const metaSuffix = isMeta && customGoalOrMeta.attachments && customGoalOrMeta.attachments.length > 0
        ? ` (+${customGoalOrMeta.attachments.length} tệp đính kèm)`
        : "";
      recordLiveEvent("ai_ceo", "AI CEO tiếp nhận chỉ đạo", `${goalText}${metaSuffix}`, "info");
      recordLiveEvent(
        (intent === "orchestration" ? "ai_ceo" : intent) as DepartmentType | "ai_ceo",
        "Phân công và điều phối nhiệm vụ",
        `Đã phân công nhân sự AI cho: "${goalText.length > 45 ? `${goalText.slice(0, 42)}...` : goalText}"`,
        "info"
      );
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
        await interruptibleDelay(1200);

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

        const normalizedGoal = goalText.replace(/\s+/g, " ").trim();
        const isCampaignGoal =
          /chiến\s*dịch|toàn\s*bộ|tất\s*cả\s*khách|mọi\s*khách|bắn\s*mail|bắn\s*email|ý\s*tưởng\s*gửi/i.test(
            normalizedGoal,
          ) ||
          (/sản\s*phẩm\s*mới|bộ\s*sưu\s*tập|hàng\s*mới|khuyến\s*mãi|ưu\s*đãi|flash\s*sale/i.test(normalizedGoal) &&
            /gửi|mail|email|bắn/i.test(normalizedGoal));
        let supportProposalId = "";

        if (isCampaignGoal && supportApi.createEmailCampaignProposal) {
          const campType = /sản\s*phẩm\s*mới|bộ\s*sưu\s*tập|hàng\s*mới/i.test(normalizedGoal)
            ? "new_product_announcement"
            : /ưu\s*đãi|khuyến\s*mãi|flash\s*sale|giảm\s*giá|voucher/i.test(normalizedGoal)
              ? "promotion_announcement"
              : "customer_care_vip";

          let targetSegment: "all_active_customers" | "vip_customers" | "recent_buyers" | undefined;
          if (/toàn\s*bộ|tất\s*cả|mọi\s*khách|all/i.test(normalizedGoal)) {
            targetSegment = "all_active_customers";
          } else if (/vip|thân\s*thiết|chi\s*tiêu\s*cao/i.test(normalizedGoal)) {
            targetSegment = "vip_customers";
          } else if (/gần\s*đây|mới\s*mua|vừa\s*mua/i.test(normalizedGoal)) {
            targetSegment = "recent_buyers";
          } else if (campType === "new_product_announcement" || campType === "promotion_announcement") {
            targetSegment = "all_active_customers";
          } else {
            targetSegment = "vip_customers";
          }

          const campProposal = await supportApi.createEmailCampaignProposal({
            type: campType,
            prompt: goalText,
            targetSegment,
          });
          setSupportCampaignProposal(campProposal);
          supportProposalId = campProposal.id;
        } else {
          const proposal = await supportApi.generateSupportProposal(goalText);
          setSupportProposal(proposal);
          setSupportTicketsPage(1);
          setSupportVipPage(1);
          supportProposalId = proposal.id;
        }

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
        recordLiveEvent(
          "support",
          isCampaignGoal ? "CSKH đã lập xong chiến dịch email" : "CSKH đã hoàn tất tác vụ",
          goalText,
          "success",
          "Xem kết quả",
          () => {
            if (isCampaignGoal) {
              setIsSupportEmailApprovalModalOpen(false);
              setIsSupportCampaignModalOpen(true);
            } else {
              setIsSupportCampaignModalOpen(false);
              setIsSupportEmailApprovalModalOpen(true);
            }
          },
        );
        notifyAndShowStrategicDeliverable(
          goalText,
          supportProposalId,
          "support",
          isCampaignGoal
            ? "AI CEO & Đội ngũ CSKH đã hoàn tất lập kế hoạch chiến dịch email và file Word (.docx)! Sẵn sàng để bạn duyệt gửi."
            : "AI CEO & Đội ngũ CSKH đã hoàn tất rà soát và lập Báo cáo Word (.docx)! Sẵn sàng để bạn duyệt gửi phản hồi.",
          isCampaignGoal,
        );
        setPrompt("");
        if (onTaskCreated) onTaskCreated();
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
        await interruptibleDelay(1200);

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
        recordLiveEvent(
          "operations",
          "Vận hành đã hoàn tất tác vụ",
          goalText,
          "success",
          "Xem kết quả",
          () => {
            const deliv = buildStrategicDeliverable(goalText, proposal?.id, "operations");
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          },
        );
        notifyAndShowStrategicDeliverable(
          goalText,
          proposal?.id,
          "operations",
          "AI CEO & Kỹ sư Kho đã hoàn tất kiểm toán và lập Báo cáo Word (.docx)! Sẵn sàng để bạn tải về và phê duyệt.",
        );
        setSuccessMessage("AI CEO & Kỹ sư Kho đã hoàn tất kiểm toán và lập Báo cáo Word (.docx)! Sẵn sàng để bạn tải về và phê duyệt.");
        setPrompt("");
        if (onTaskCreated) onTaskCreated();
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
        await interruptibleDelay(1200);

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
        await interruptibleDelay(1000);
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
        await interruptibleDelay(1200);

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
        recordLiveEvent(
          "merchandising",
          "Kinh doanh đã hoàn tất tác vụ",
          goalText,
          "success",
          "Xem kết quả",
          () => {
            const deliv = buildStrategicDeliverable(goalText, cProposal?.id, "merchandising");
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          },
        );
        notifyAndShowStrategicDeliverable(
          goalText,
          cProposal?.id,
          "merchandising",
          "AI CEO và các phòng ban đã hoàn tất phối hợp! Đã lập Báo cáo Chiến lược và bảng đề xuất danh mục.",
        );
        setPrompt("");
        if (onTaskCreated) onTaskCreated();
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
        const createdCampaign = await marketingApi.createCampaign(
          {
            campaignName: `Chiến dịch: ${goalText.slice(0, 45)}`,
            objective: `Quảng bá sản phẩm và kích cầu doanh số theo chỉ đạo CEO: ${goalText}`,
            subjectKind: "free_topic",
            subjectReference: "san-pham",
            language: "vi",
            mandatoryMessage: goalText,
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
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) => (idx === 0 ? { ...s, status: "running" } : s)),
              }
            : null,
        );

        await marketingApi.markReady(createdCampaign.id);
        await interruptibleDelay(1400);

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
        await interruptibleDelay(1400);

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
        await interruptibleDelay(1000);

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
        setActiveCampaignId(createdCampaign.id);
        setMarketingCampaignModalOpen(true);

        const marketingDeliv = buildStrategicDeliverable(goalText, createdCampaign.id, "marketing");
        recordLiveEvent(
          "marketing",
          "Marketing đã hoàn tất tác vụ",
          goalText,
          "success",
          "Xem bài & poster",
          () => {
            setActiveCampaignDetail(detail);
            setMarketingCampaignModalOpen(true);
          },
        );
        setCompletionToast({
          id: createdCampaign.id,
          title: detail.campaign.campaignName || "Chiến dịch Marketing Fanpage",
          department: "marketing",
          departmentName: "Phòng Tiếp thị & Truyền thông Sáng tạo",
          goal: goalText,
          deliverable: marketingDeliv,
          timestamp: new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        });
        if (completionToastTimerRef.current) {
          clearTimeout(completionToastTimerRef.current);
        }
        completionToastTimerRef.current = setTimeout(() => {
          setCompletionToast(null);
        }, 12000);
        void refreshApprovals();
        setSuccessMessage("AI CEO đã điều phối hoàn tất bản thảo bài viết và thiết kế poster chiến dịch!");
        setPrompt("");
        if (onTaskCreated) onTaskCreated();
      } else {
        scrollToDepartment("dept-column-support");
        // Route to Orchestration (Store Health / Operations / Finance / Support)
        setActiveWorkflowKind("orchestration");

        const cleanName =
          goalText.length > 70
            ? `${goalText.slice(0, 68)}...`
            : goalText.replace(
                /^(chỉ thị|chỉ đạo|nghị quyết|lệnh điều hành|hãy|yêu cầu|triển khai|phân tích)(?:\s+(?:từ\s+)?(?:tổng\s+giám\s+đốc|ceo|ban\s+giám\s+đốc|hội\s+đồng\s+quản\s+trị))?[:\s-]*/i,
                "",
              );

        setCeoPlan({
          goal: goalText,
          targetDept: "AI CEO & Hội đồng Chiến lược Liên phòng ban",
          steps: [
            {
              role: "AI CEO (Tổng Giám Đốc AI)",
              task: `Phân tích yêu cầu chiến lược, đánh giá mục tiêu & lập kế hoạch phân rã cho: "${cleanName}"`,
              status: "running",
            },
            {
              role: "Chuyên viên Nghiên cứu & Định giá",
              task: `Thu thập dữ liệu thị trường, phân tích đối thủ cạnh tranh & cơ cấu giá thâm nhập`,
              status: "pending",
            },
            {
              role: "Điều phối Tiếp thị & Chuỗi cung ứng",
              task: `Lập kế hoạch ra mắt đa kênh, dự toán ngân sách, tồn kho an toàn & ma trận rủi ro`,
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: `Phê duyệt Báo cáo Chiến lược Điều hành & Kế hoạch thực thi Word (.docx)`,
              status: "pending",
            },
          ],
        });

        // Stage 1: AI CEO Strategic Intake & Decomposition
        setMarketingActiveAgent("ceo");
        setMarketingAgentMessage("👑 AI CEO đang phân tích yêu cầu chiến lược và điều phối các phòng ban số...");

        const idempotencyKey = crypto.randomUUID();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const created = await api.createTask(
          {
            mode: "advanced",
            goal: goalText,
            instructions: enrichedInstructions || customInstructions || `Rà soát toàn diện và phân tích rủi ro thực tế cho mục tiêu: ${goalText}`,
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

        // Transition: Step 1 done -> Step 2 running
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

        // Stage 2: Research & Pricing Strategist
        setMarketingActiveAgent("pricing_strategist");
        setMarketingAgentMessage("📊 Chuyên viên Nghiên cứu đang phân tích số liệu thị trường Đông Nam Á và phân khúc mục tiêu...");
        await interruptibleDelay(1100);

        // Transition: Step 2 done -> Step 3 running
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx <= 1 ? { ...s, status: "done" } : idx === 2 ? { ...s, status: "running" } : s,
                ),
              }
            : null,
        );

        // Stage 3: Operations & Multi-channel Coordinator
        setMarketingActiveAgent("order_coordinator");
        setMarketingAgentMessage("📦 Điều phối Vận hành đang tính toán kế hoạch ra mắt đa kênh, dự toán ngân sách & ma trận rủi ro...");
        await interruptibleDelay(1000);

        // Transition: Step 3 done -> Step 4 ready
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

        setMarketingActiveAgent(null);
        setMarketingAgentMessage(null);

        // Record live success event with direct clickable action
        recordLiveEvent(
          "ai_ceo",
          "AI CEO đã hoàn tất tác vụ",
          goalText,
          "success",
          "Xem kết quả",
          () => {
            const deliv = buildStrategicDeliverable(goalText, created.task.id, "ai_ceo");
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          },
        );

        notifyAndShowStrategicDeliverable(
          goalText,
          created.task.id,
          "ai_ceo",
          "AI CEO đã phân tích toàn diện và lập Báo cáo Chiến lược Word (.docx)! Bấm vào tài liệu để xem chi tiết.",
        );
        setPrompt("");
        if (onTaskCreated) onTaskCreated();
      }
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && (error.name === "AbortError" || error.message === "Aborted"))
      ) {
        return;
      }
      console.error("Failed to execute strategic task:", error);
      setErrorMessage(error instanceof Error ? error.message : "Không thể gửi tác vụ đến hệ thống.");
    } finally {
      setIsSubmitting(false);
      strategicAbortRef.current = null;
      setActiveLocks((prevLocks) => {
        const remaining = releaseLocks(strategicAgents, prevLocks);
        notifyResourceWaiters(strategicAgents);
        setTimeout(() => processNextQueuedTask(remaining), 50);
        return remaining;
      });
    }
  };

  const handleStopStrategicTask = useCallback(() => {
    if (strategicAbortRef.current) {
      strategicAbortRef.current.abort();
      strategicAbortRef.current = null;
    }
    setIsSubmitting(false);
    setIsCeoThinking(false);
    setCeoThinkingText("");
    setAnalysisStep(0);
    setElapsedSeconds(0);
    setMarketingActiveAgent(null);
    setMarketingAgentMessage(null);
    setActiveCollaboration(null);
    setActiveLocks({});
    setDeptStatus({
      marketing: { activeAgent: null, agentMessage: null, completedAgents: [] },
      merchandising: { activeAgent: null, agentMessage: null, completedAgents: [] },
      operations: { activeAgent: null, agentMessage: null, completedAgents: [] },
      support: { activeAgent: null, agentMessage: null, completedAgents: [] },
    });
    setCeoPlan(null);
    setActiveWorkflowKind("orchestration");
    setCompletedStrategicDeliverable(null);
    setSelectedStrategicDeliverable(null);

    if (activeRunId) {
      void api.cancelWorkflow(activeRunId, 1, "CANCELED_BY_STAFF").catch(() => {});
    }
    if (activeCampaignId && marketingApi?.cancelCampaign) {
      void marketingApi.cancelCampaign(activeCampaignId, "Dừng bởi người vận hành").catch(() => {});
    }
    if (supportCampaignProposal?.id && supportApi?.cancelEmailCampaignProposal) {
      void supportApi.cancelEmailCampaignProposal(supportCampaignProposal.id).catch(() => {});
    }

    recordLiveEvent(
      "ai_ceo",
      "Đã dừng tác vụ",
      "Người điều hành đã dừng tiến trình thực thi tác vụ.",
      "warning",
    );
    setSuccessMessage("Đã dừng thực thi tác vụ thành công.");
  }, [api, activeRunId, activeCampaignId, marketingApi, supportCampaignProposal, supportApi, recordLiveEvent]);

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
      setStrategicDeliverableApproved(false);
      setElapsedSeconds(0);
      if (dept === "marketing" && marketingApi) {
        scrollToDepartment("dept-column-marketing");
        setActiveWorkflowKind("marketing");
        setCeoPlan({
          goal: taskPrompt,
          targetDept: "Phòng Tiếp thị & Truyền thông Sáng tạo",
          steps: [
            {
              role: "Cây bút Sáng tạo (Copywriter)",
              task: `Soạn thảo nội dung bài viết và hashtag cho: "${taskPrompt.slice(0, 35)}..."`,
              status: "running",
            },
            {
              role: "Thiết kế Đồ họa (Visual Designer)",
              task: "Dựng poster và banner sản phẩm 1:1 chuẩn Fanpage",
              status: "pending",
            },
            {
              role: "Điều phối Đăng bài (Publisher)",
              task: "Chuẩn bị gói xuất bản Fanpage & đối soát băm SHA-256",
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: "Phê duyệt & xuất bản Fanpage Facebook",
              status: "pending",
            },
          ],
        });

        // Step 1: Copywriter
        setDeptActiveAgent("marketing", "marketing_copywriter", `Cây bút Sáng tạo đang soạn nội dung: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("marketing_copywriter");
        setMarketingAgentMessage(`Cây bút Sáng tạo đang soạn nội dung: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

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

        // Step 2: Visual Designer
        setDeptActiveAgent("marketing", "marketing_visual", "Thiết kế Đồ họa đang dựng poster và banner...", "marketing_copywriter");
        setMarketingActiveAgent("marketing_visual");
        setMarketingAgentMessage("Thiết kế Đồ họa đang dựng poster và banner...");
        await new Promise((r) => setTimeout(r, 800));

        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx < 2 ? { ...s, status: "done" } : idx === 2 ? { ...s, status: "running" } : s,
                ),
              }
            : null,
        );

        // Step 3: Publisher
        setDeptActiveAgent("marketing", "marketing_publisher", "Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage...", "marketing_visual");
        setMarketingActiveAgent("marketing_publisher");
        setMarketingAgentMessage("Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage...");
        await new Promise((r) => setTimeout(r, 800));

        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx < 3 ? { ...s, status: "done" } : idx === 3 ? { ...s, status: "running" } : s,
                ),
              }
            : null,
        );

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
        setActiveCampaignId(createdCampaign.id);
        setMarketingCampaignModalOpen(true);

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
        const marketingDirectDeliv = buildStrategicDeliverable(taskPrompt, createdCampaign.id, "marketing");
        recordLiveEvent(
          "marketing",
          "Marketing đã hoàn tất tác vụ",
          taskPrompt,
          "success",
          "Xem bài & poster",
          () => {
            setActiveCampaignDetail(detail);
            setMarketingCampaignModalOpen(true);
          },
        );
        setCompletionToast({
          id: createdCampaign.id,
          title: detail.campaign.campaignName || "Chiến dịch Marketing Fanpage",
          department: "marketing",
          departmentName: "Phòng Tiếp thị & Truyền thông Sáng tạo",
          goal: taskPrompt,
          deliverable: marketingDirectDeliv,
          timestamp: new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        });
        if (completionToastTimerRef.current) {
          clearTimeout(completionToastTimerRef.current);
        }
        completionToastTimerRef.current = setTimeout(() => {
          setCompletionToast(null);
        }, 12000);
        void refreshApprovals();
        setSuccessMessage("Đã hoàn tất soạn thảo bài viết & thiết kế poster chiến dịch Marketing!");
        if (onTaskCreated) onTaskCreated();
      } else if (dept === "merchandising" && catalogApi) {
        scrollToDepartment("dept-column-merchandising");
        setActiveWorkflowKind("merchandising");
        setCeoPlan({
          goal: taskPrompt,
          targetDept: "Phòng Danh mục & Định giá",
          steps: [
            {
              role: "Cây bút Sản phẩm (Catalog Copywriter)",
              task: `Tối ưu tiêu đề SEO & mô tả cho: "${taskPrompt.slice(0, 35)}..."`,
              status: "running",
            },
            {
              role: "Thiết kế Đồ họa (Phối hợp Tiếp thị)",
              task: "Thiết kế Poster & Banner 3D ưu đãi",
              status: "pending",
            },
            {
              role: "Chuyên viên Định giá (Pricing Strategist)",
              task: "Tính toán chiết khấu & biên lợi nhuận Flash Sale",
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: "Phê duyệt áp dụng bảng giá mới lên Storefront",
              status: "pending",
            },
          ],
        });

        // Step 1: Catalog Copywriter
        setDeptActiveAgent("merchandising", "catalog_copywriter", `Cây bút Sản phẩm đang tối ưu tiêu đề SEO cho: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("catalog_copywriter");
        setMarketingAgentMessage(`Cây bút Sản phẩm đang tối ưu tiêu đề SEO cho: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

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
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx < 3 ? { ...s, status: "done" } : idx === 3 ? { ...s, status: "running" } : s,
                ),
              }
            : null,
        );

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
        recordLiveEvent(
          "merchandising",
          "Kinh doanh đã hoàn tất tác vụ",
          taskPrompt,
          "success",
          "Xem kết quả",
          () => {
            const deliv = buildStrategicDeliverable(taskPrompt, cProposal?.id, "merchandising");
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          },
        );
        notifyAndShowStrategicDeliverable(
          taskPrompt,
          cProposal?.id,
          "merchandising",
          "Đã lập xong Đề xuất Chiến dịch Danh mục & Báo cáo Chiến lược Word (.docx)!",
        );
        if (onTaskCreated) onTaskCreated();
      } else if (dept === "operations" && inventoryApi) {
        scrollToDepartment("dept-column-operations");
        setActiveWorkflowKind("operations");
        setCeoPlan({
          goal: taskPrompt,
          targetDept: "Phòng Vận hành & Kho vận",
          steps: [
            {
              role: "Kỹ sư Tồn kho (Inventory Specialist)",
              task: `Kiểm toán dữ liệu SKU cho: "${taskPrompt.slice(0, 35)}..."`,
              status: "running",
            },
            {
              role: "Điều phối Đơn hàng (Order Coordinator)",
              task: "Lập phiếu đề xuất nhập kho & Báo cáo Kiểm toán Word",
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: "Phê duyệt kế hoạch nhập kho",
              status: "pending",
            },
          ],
        });

        // Step 1: Inventory Specialist
        setDeptActiveAgent("operations", "inventory_specialist", `Kỹ sư Tồn kho đang kiểm toán dữ liệu SKU cho: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("inventory_specialist");
        setMarketingAgentMessage(`Kỹ sư Tồn kho đang kiểm toán dữ liệu SKU cho: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

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

        // Step 2: Order Coordinator
        setDeptActiveAgent("operations", "order_coordinator", "Điều phối Đơn hàng đang lập phiếu đề xuất nhập kho...", "inventory_specialist");
        setMarketingActiveAgent("order_coordinator");
        setMarketingAgentMessage("Điều phối Đơn hàng đang lập phiếu đề xuất nhập kho...");
        await new Promise((r) => setTimeout(r, 800));

        const proposal = await inventoryApi.generateOperationsProposal(taskPrompt);
        setOperationsProposal(proposal);
        setOperationsPage(1);

        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s, idx) =>
                  idx < 2 ? { ...s, status: "done" } : idx === 2 ? { ...s, status: "running" } : s,
                ),
              }
            : null,
        );

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
        recordLiveEvent(
          "operations",
          "Vận hành đã hoàn tất tác vụ",
          taskPrompt,
          "success",
          "Xem kết quả",
          () => {
            const deliv = buildStrategicDeliverable(taskPrompt, proposal?.id, "operations");
            setSelectedStrategicDeliverable(deliv);
            setIsStrategicModalOpen(true);
          },
        );
        notifyAndShowStrategicDeliverable(
          taskPrompt,
          proposal?.id,
          "operations",
          "Đã lập xong Phiếu Đề Xuất Nhập Kho & Báo cáo Kiểm toán Vận hành Word (.docx)!",
        );
        if (onTaskCreated) onTaskCreated();
      } else if (dept === "support" && supportApi) {
        scrollToDepartment("dept-column-support");
        setActiveWorkflowKind("support");
        setCeoPlan({
          goal: taskPrompt,
          targetDept: "Phòng Chăm sóc Khách hàng & CRM",
          steps: [
            {
              role: "Quản gia CSKH (Support Steward)",
              task: `Rà soát ticket sự cố cho: "${taskPrompt.slice(0, 35)}..."`,
              status: "running",
            },
            {
              role: "Chuyên viên CRM (CRM Specialist)",
              task: "Phân tích khách hàng VIP & lập báo cáo giữ chân",
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: "Phê duyệt kịch bản chăm sóc & voucher",
              status: "pending",
            },
          ],
        });

        // Step 1: Support Steward
        setDeptActiveAgent("support", "support_steward", `Quản gia CSKH đang rà soát ticket sự cố cho: "${taskPrompt.slice(0, 45)}"...`);
        setMarketingActiveAgent("support_steward");
        setMarketingAgentMessage(`Quản gia CSKH đang rà soát ticket sự cố cho: "${taskPrompt.slice(0, 45)}"...`);
        await new Promise((r) => setTimeout(r, 800));

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

        // Step 2: CRM Specialist
        setDeptActiveAgent("support", "crm_specialist", "Chuyên viên CRM đang phân tích khách hàng VIP & lập báo cáo...", "support_steward");
        setMarketingActiveAgent("crm_specialist");
        setMarketingAgentMessage("Chuyên viên CRM đang phân tích khách hàng VIP & lập báo cáo...");
        await new Promise((r) => setTimeout(r, 800));

        const normalizedPrompt = taskPrompt.replace(/\s+/g, " ").trim();
        const isCampaignGoal =
          /chiến\s*dịch|toàn\s*bộ|tất\s*cả\s*khách|mọi\s*khách|bắn\s*mail|bắn\s*email|ý\s*tưởng\s*gửi/i.test(
            normalizedPrompt,
          ) ||
          (/sản\s*phẩm\s*mới|bộ\s*sưu\s*tập|hàng\s*mới|khuyến\s*mãi|ưu\s*đãi|flash\s*sale/i.test(normalizedPrompt) &&
            /gửi|mail|email|bắn/i.test(normalizedPrompt));

        if (isCampaignGoal && supportApi.createEmailCampaignProposal) {
          const campType = /sản\s*phẩm\s*mới|bộ\s*sưu\s*tập|hàng\s*mới/i.test(normalizedPrompt)
            ? "new_product_announcement"
            : /ưu\s*đãi|khuyến\s*mãi|flash\s*sale|giảm\s*giá|voucher/i.test(normalizedPrompt)
              ? "promotion_announcement"
              : "customer_care_vip";

          let targetSegment: "all_active_customers" | "vip_customers" | "recent_buyers" | undefined;
          if (/toàn\s*bộ|tất\s*cả|mọi\s*khách|all/i.test(normalizedPrompt)) {
            targetSegment = "all_active_customers";
          } else if (/vip|thân\s*thiết|chi\s*tiêu\s*cao/i.test(normalizedPrompt)) {
            targetSegment = "vip_customers";
          } else if (/gần\s*đây|mới\s*mua|vừa\s*mua/i.test(normalizedPrompt)) {
            targetSegment = "recent_buyers";
          } else if (campType === "new_product_announcement" || campType === "promotion_announcement") {
            targetSegment = "all_active_customers";
          } else {
            targetSegment = "vip_customers";
          }

          const campProposal = await supportApi.createEmailCampaignProposal({
            type: campType,
            prompt: taskPrompt,
            targetSegment,
          });
          setSupportCampaignProposal(campProposal);

          setCeoPlan((prev) =>
            prev
              ? {
                  ...prev,
                  steps: prev.steps.map((s, idx) =>
                    idx < 2 ? { ...s, status: "done" } : idx === 2 ? { ...s, status: "running" } : s,
                  ),
                }
              : null,
          );

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
          recordLiveEvent(
            "support",
            "CSKH đã lập xong chiến dịch email",
            taskPrompt,
            "success",
            "Xem kết quả",
            () => {
              setIsSupportEmailApprovalModalOpen(false);
              setIsSupportCampaignModalOpen(true);
            },
          );
          notifyAndShowStrategicDeliverable(
            taskPrompt,
            campProposal?.id,
            "support",
            "Đã lập xong Kế Hoạch Chiến Dịch Email CSKH & Báo Cáo Chiến Lược Word (.docx)!",
            true,
          );
          if (onTaskCreated) onTaskCreated();
        } else {
          const proposal = await supportApi.generateSupportProposal(taskPrompt);
          setSupportProposal(proposal);
          setSupportTicketsPage(1);
          setSupportVipPage(1);

          setCeoPlan((prev) =>
            prev
              ? {
                  ...prev,
                  steps: prev.steps.map((s, idx) =>
                    idx < 2 ? { ...s, status: "done" } : idx === 2 ? { ...s, status: "running" } : s,
                  ),
                }
              : null,
          );

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
          recordLiveEvent(
            "support",
            "CSKH đã hoàn tất tác vụ",
            taskPrompt,
            "success",
            "Xem kết quả",
            () => {
              setIsSupportEmailApprovalModalOpen(true);
            },
          );
          notifyAndShowStrategicDeliverable(
            taskPrompt,
            proposal?.id,
            "support",
            "Đã lập xong Đề xuất Xử lý CSKH, Phân tích VIP & Báo cáo Giữ chân Khách hàng Word (.docx)!",
          );
          if (onTaskCreated) onTaskCreated();
        }
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

      recordLiveEvent(
        departmentType,
        "Nhiệm vụ thêm vào hàng chờ",
        `Đang đợi nhân sự ${
          DIGITAL_EMPLOYEES[initialConflict.agentId]?.name || initialConflict.agentId
        } hoàn tất công việc...`,
        "warning"
      );

      setSuccessMessage(
        `Nhiệm vụ đã được thêm vào hàng chờ (đang đợi nhân sự ${
          DIGITAL_EMPLOYEES[initialConflict.agentId]?.name || initialConflict.agentId
        } hoàn tất công việc).`,
      );
      return;
    }

    // Initial agent is free: execute immediately!
    const taskId = crypto.randomUUID();
    recordLiveEvent(
      departmentType,
      "Khởi chạy nhiệm vụ trực tiếp",
      directPrompt.length > 50 ? `${directPrompt.slice(0, 48)}...` : directPrompt,
      "info"
    );
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

  const handleApplySupport = async (selectedTicketIds?: readonly string[]) => {
    if (!supportProposal?.id || !supportApi) return;
    const selectedIds = new Set(
      selectedTicketIds ?? supportProposal.tickets.map((ticket) => ticket.ticketId),
    );
    const selectedTickets = supportProposal.tickets.filter((ticket) => selectedIds.has(ticket.ticketId));
    if (selectedTickets.length === 0) return;
    const previousProposal = supportProposal;
    const remainingTickets = supportProposal.tickets.filter(
      (ticket) => !selectedIds.has(ticket.ticketId),
    );
    const completedAll = remainingTickets.length === 0;

    setSupportProposal({
      ...supportProposal,
      tickets: completedAll ? supportProposal.tickets : remainingTickets,
      totalTickets: completedAll ? supportProposal.totalTickets : remainingTickets.length,
      status: completedAll ? "applied" : "pending_approval",
    });
    if (completedAll) {
      setIsSupportEmailApprovalModalOpen(false);
    }

    try {
      setSupportActionLoading(true);
      setErrorMessage(null);
      const items = selectedTickets.map((t) => ({
        ticketId: t.ticketId,
        responseMessage: t.proposedResponse,
        resolutionStatus: "resolved" as const,
      }));
      await supportApi.applySupportProposal(supportProposal.id, items);

      if (completedAll) {
        setCeoPlan((prev) =>
          prev
            ? {
                ...prev,
                steps: prev.steps.map((s) => ({ ...s, status: "done" })),
              }
            : null,
        );
        setDeptStatus((prev) => ({
          ...prev,
          support: { activeAgent: null, agentMessage: null, completedAgents: [] },
        }));
        recordLiveEvent(
          "support",
          "CSKH đã gửi email phản hồi",
          supportProposal.overallSentimentSummary || supportProposal.prompt || "Đã phản hồi toàn bộ ticket CSKH",
          "success",
          "Xem kết quả",
          () => setIsSupportEmailApprovalModalOpen(true),
          new Date().toISOString(),
          `support-prop-ev-${supportProposal.id}`,
        );
        await persistCommandActivity({
          department: "support",
          decision: "approved",
          resourceType: "support_proposal",
          resourceId: supportProposal.id,
          summary: supportProposal.overallSentimentSummary || `Đã gửi phản hồi cho ${selectedTickets.length} khách hàng.`,
        });
      }

      setSuccessMessage(
        completedAll
          ? `✅ Đã phê duyệt và gửi toàn bộ ${selectedTickets.length} email CSKH thành công!`
          : `✅ Đã gửi ${selectedTickets.length} email. Còn ${remainingTickets.length} email đang chờ phê duyệt.`,
      );
      if (onTaskCreated) onTaskCreated();
    } catch (err) {
      console.error("Failed to apply support proposal:", err);
      setSupportProposal((current) => current?.id === previousProposal.id ? previousProposal : current);
      setErrorMessage(err instanceof Error ? err.message : "Không thể gửi phản hồi CSKH.");
    } finally {
      setSupportActionLoading(false);
    }
  };

  const handleApplySupportCampaign = async (selectedRecipientIds?: readonly string[]) => {
    if (!supportCampaignProposal || !supportApi?.applyEmailCampaignProposal) return;
    const previousProposal = supportCampaignProposal;
    const targetCount = selectedRecipientIds && selectedRecipientIds.length > 0
      ? selectedRecipientIds.length
      : previousProposal.totalRecipients;

    // Optimistic UI: immediately mark sent, clear deliverable, and close modal so approval leaves inbox instantly
    setSupportCampaignProposal((prev) => (prev ? { ...prev, status: "sent" } : null));
    setCompletedStrategicDeliverable(null);
    setStrategicDeliverableApproved(true);
    setIsSupportCampaignModalOpen(false);
    setIsSupportCampaignSubmitting(true);

    try {
      const result = await supportApi.applyEmailCampaignProposal(
        previousProposal.id,
        selectedRecipientIds,
      );
      const dispatchedCount = result?.successfulDispatches ?? targetCount;
      setSuccessMessage(`✅ Đã phê duyệt và gửi thành công chiến dịch email tới ${dispatchedCount} khách hàng!`);

      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );

      recordLiveEvent(
        "support",
        "CSKH gửi chiến dịch email",
        `Đã gửi thành công chiến dịch "${previousProposal.title}" tới ${dispatchedCount} khách hàng`,
        "success",
        "Xem chiến dịch",
        () => setIsSupportCampaignModalOpen(true),
        new Date().toISOString(),
        `campaign-ev-${previousProposal.id}`,
      );

      await persistCommandActivity({
        department: "support",
        decision: "approved",
        resourceType: "support_proposal",
        resourceId: previousProposal.id,
        summary: `Đã gửi chiến dịch email "${previousProposal.title}" tới ${dispatchedCount} khách hàng.`,
      });

      if (onTaskCreated) onTaskCreated();
    } catch (err) {
      console.error("Failed to apply support email campaign:", err);
      // Revert optimistic state on error
      setSupportCampaignProposal(previousProposal);
      setStrategicDeliverableApproved(false);
      setErrorMessage(err instanceof Error ? err.message : "Không thể gửi chiến dịch email.");
    } finally {
      setIsSupportCampaignSubmitting(false);
    }
  };

  const handleDownloadSupportCampaignDocx = async () => {
    if (!supportCampaignProposal || !supportApi?.downloadEmailCampaignDocx) return;
    try {
      await supportApi.downloadEmailCampaignDocx(
        supportCampaignProposal.id,
        supportCampaignProposal.docxFilename,
      );
    } catch (err) {
      console.error("Failed to download support campaign docx:", err);
      setErrorMessage(err instanceof Error ? err.message : "Không thể tải file Word kế hoạch email.");
    }
  };

  // Marketing Actions
  const handleApproveMarketing = async (targetId?: string) => {
    const campId = targetId || activeCampaignId;
    if (!campId || !marketingApi) return;
    try {
      setMarketingActionLoading(true);
      setErrorMessage(null);
      await marketingApi.approveCampaign(campId, { decision: "approve" });
      const detail = await marketingApi.getCampaign(campId);
      setActiveCampaignDetail(detail);
      setActiveCampaignId(campId);

      const isPublished =
        detail.campaign.state === "completed" ||
        Boolean(detail.publicationRecord?.externalPostId) ||
        Boolean(detail.publicationRecords && detail.publicationRecords.length > 0);

      if (isPublished) {
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
        recordLiveEvent(
          "marketing",
          "Marketing đã hoàn tất tác vụ",
          detail.campaign.campaignName || "Chiến dịch Marketing Fanpage",
          "success",
          "Xem kết quả",
          () => {
            setActiveCampaignDetail(detail);
            setPreviewCampaignDetail(detail);
            setMarketingCampaignModalOpen(true);
          },
          detail.campaign.updatedAt,
          `marketing-camp-${campId}`,
        );
        await persistCommandActivity({
          department: "marketing",
          decision: "approved",
          resourceType: "marketing_campaign",
          resourceId: campId,
          summary: detail.campaign.campaignName || "Chiến dịch Marketing Fanpage",
        });
        setSuccessMessage("Đã duyệt và xuất bản bài viết thành công lên Fanpage Facebook!");
        if (onTaskCreated) onTaskCreated();
      } else if (detail.campaign.state === "failed" || detail.campaign.state === "partial_failure") {
        setErrorMessage(
          "⚠️ Phê duyệt hoàn tất nhưng xuất bản lên Fanpage gặp lỗi do Token Meta Facebook chưa hợp lệ. Bạn có thể nhấn 'Thử xuất bản lại' hoặc kiểm tra Token.",
        );
      }

      // Refresh recent campaigns list
      marketingApi
        .listCampaigns({ limit: 20 })
        .then((res) =>
          setCampaignsList(
            res.items.filter((c) => !canceledCampaignIdsRef.current.has(c.id) && c.state !== "canceled"),
          ),
        )
        .catch(() => {});
    } catch (err: any) {
      setErrorMessage(err.message || "Phê duyệt thất bại.");
    } finally {
      setMarketingActionLoading(false);
    }
  };

  const handleRevisionMarketing = async (feedbackText?: string, targetId?: string) => {
    const campId = targetId || activeCampaignId;
    const feedback = typeof feedbackText === "string" ? feedbackText : revisionInput;
    if (!campId || !marketingApi || !feedback.trim()) return;
    try {
      setMarketingActionLoading(true);
      setErrorMessage(null);
      await marketingApi.requestRevision(campId, { feedback: feedback.trim() });
      const detail = await marketingApi.getCampaign(campId);
      setActiveCampaignDetail(detail);
      setActiveCampaignId(campId);
      setRevisionInput("");
      setShowRevisionForm(false);
      setSuccessMessage("Đã gửi yêu cầu chỉnh sửa! 3 nhân sự số Marketing đang tạo lại bản sửa đổi mới.");
      marketingApi
        .listCampaigns({ limit: 20 })
        .then((res) =>
          setCampaignsList(
            res.items.filter((c) => !canceledCampaignIdsRef.current.has(c.id) && c.state !== "canceled"),
          ),
        )
        .catch(() => {});
    } catch (err: any) {
      setErrorMessage(err.message || "Yêu cầu chỉnh sửa thất bại.");
    } finally {
      setMarketingActionLoading(false);
    }
  };

  const handleRetryPublication = async (targetId?: string) => {
    const campId = targetId || activeCampaignId;
    if (!campId || !marketingApi) return;
    try {
      setMarketingActionLoading(true);
      setErrorMessage(null);
      await marketingApi.retryPublication(campId);
      const detail = await marketingApi.getCampaign(campId);
      setActiveCampaignDetail(detail);
      setActiveCampaignId(campId);

      const isPublished =
        detail.campaign.state === "completed" ||
        Boolean(detail.publicationRecord?.externalPostId) ||
        Boolean(detail.publicationRecords && detail.publicationRecords.length > 0);

      if (isPublished) {
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
        setSuccessMessage("Đã xuất bản lại thành công lên Fanpage Facebook!");
      } else if (detail.campaign.state === "failed" || detail.campaign.state === "partial_failure") {
        setErrorMessage("Xuất bản lại chưa thành công. Vui lòng kiểm tra lại Token Meta Facebook.");
      }

      // Refresh recent campaigns list
      marketingApi
        .listCampaigns({ limit: 20 })
        .then((res) =>
          setCampaignsList(
            res.items.filter((c) => !canceledCampaignIdsRef.current.has(c.id) && c.state !== "canceled"),
          ),
        )
        .catch(() => {});
    } catch (err: any) {
      setErrorMessage(err.message || "Đăng lại lên Facebook thất bại.");
    } finally {
      setMarketingActionLoading(false);
    }
  };

  const handleCancelMarketingCampaign = async (targetId?: string) => {
    const campId = targetId || activeCampaignId;
    if (!campId) return;
    const campaignSummary = activeCampaignDetail?.campaign.id === campId
      ? activeCampaignDetail.campaign.campaignName
      : campaignsList.find((campaign) => campaign.id === campId)?.campaignName;
    try {
      setMarketingActionLoading(true);
      if (marketingApi?.cancelCampaign) {
        await marketingApi.cancelCampaign(campId, "Hủy duyệt bởi Quản trị viên");
      }
      const persisted = await persistCommandActivity({
        department: "marketing",
        decision: "canceled",
        resourceType: "marketing_campaign",
        resourceId: campId,
        summary: campaignSummary || "Đề xuất chiến dịch Marketing",
      });
      if (!persisted) return;
      markCampaignCanceled(campId);
      setCampaignsList((prev) => prev.filter((c) => c.id !== campId));
      if (activeCampaignId === campId) {
        setActiveCampaignId(null);
        setActiveCampaignDetail(null);
        setCeoPlan(null);
        setActiveWorkflowKind("orchestration");
        setCompletedStrategicDeliverable(null);
      } else if (activeCampaignDetail?.campaign.id === campId) {
        setActiveCampaignDetail(null);
        setCeoPlan(null);
        setActiveWorkflowKind("orchestration");
        setCompletedStrategicDeliverable(null);
      }
      if (previewCampaignDetail?.campaign.id === campId) setPreviewCampaignDetail(null);
      setMarketingCampaignModalOpen(false);
      setShowRevisionModal(false);
      setSuccessMessage("Đã hủy duyệt đề xuất chiến dịch Marketing.");
      const res = await marketingApi?.listCampaigns({ limit: 20 });
      if (res?.items) {
        setCampaignsList(
          res.items.filter(
            (c) => !canceledCampaignIdsRef.current.has(c.id) && c.id !== campId && c.state !== "canceled",
          ),
        );
      }
    } catch (err: any) {
      console.warn("Marketing campaign cancel notice:", err);
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
        const approvedProposal = campaignProposal;
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
        await persistCommandActivity({
          department: "merchandising",
          decision: "approved",
          resourceType: "merchandising_proposal",
          resourceId: approvedProposal.id,
          summary: approvedProposal.name,
        });
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
      await persistCommandActivity({
        department: "merchandising",
        decision: "approved",
        resourceType: "merchandising_proposal",
        resourceId: merchandisingProposal.id,
        summary: merchandisingProposal.pricingRationale || "Đã áp dụng đề xuất giá và danh mục lên Storefront.",
      });
    } catch (err: any) {
      console.error("Apply merchandising proposal failed:", err);
      setErrorMessage(err.message || "Không thể áp dụng đề xuất lên Storefront.");
    } finally {
      setMerchandisingLoading(false);
    }
  };

  const handleApproveCampaign = async (options: {
    readonly endDate: string;
    readonly excludedItemIds: readonly string[];
    readonly conflictResolution?: "replace" | "schedule_after";
  }) => {
    if (!catalogApi || !campaignProposal) return;
    try {
      setIsActivatingCampaign(true);
      setErrorMessage(null);
      await catalogApi.activateCampaign(campaignProposal.id, {
        endDate: options.endDate,
        excludedItemIds: options.excludedItemIds,
        conflictResolution: options.conflictResolution,
      });
      campaignProposalsCache.current[campaignProposal.id] = campaignProposal;
      const approvedCampId = campaignProposal.id;
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
      setActiveCampaigns(active?.activeCampaigns ?? (active ? [active] : []));

      // Complete steps in CEO Plan
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );

      recordLiveEvent(
        "merchandising",
        "Kinh doanh đã hoàn tất tác vụ",
        `Chiến dịch: ${campaignProposal.name}`,
        "success",
        "Xem kết quả",
        () => {
          void handleOpenCampaignDeliverable(approvedCampId, true);
        },
        new Date().toISOString(),
        `camp-ev-${campaignProposal.id}`,
      );
      await persistCommandActivity({
        department: "merchandising",
        decision: "approved",
        resourceType: "merchandising_proposal",
        resourceId: approvedCampId,
        summary: `Chiến dịch: ${campaignProposal.name}`,
      });

      setSuccessMessage(`Chiến dịch "${campaignProposal.name}" đã được kích hoạt thành công trên Storefront với giá chiết khấu thời gian thực!`);
      if (onTaskCreated) onTaskCreated();
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
      const active = await catalogApi.getActiveCampaign();
      setActiveCampaign(active);
      setActiveCampaigns(active?.activeCampaigns ?? (active ? [active] : []));
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

      recordLiveEvent(
        "operations",
        "Vận hành đã hoàn tất tác vụ",
        operationsProposal.summary || `Đã nhập kho bổ sung +${totalRestocked} đơn vị hàng`,
        "success",
        "Xem kết quả",
        () => {
          const deliv = buildStrategicDeliverable(
            operationsProposal.summary || "Đề xuất nhập kho bổ sung hàng an toàn",
            operationsProposal.id,
            "operations",
          );
          setSelectedStrategicDeliverable(deliv);
          setIsStrategicModalOpen(true);
        },
        new Date().toISOString(),
        `ops-prop-ev-${operationsProposal.id}`,
      );
      await persistCommandActivity({
        department: "operations",
        decision: "approved",
        resourceType: "operations_proposal",
        resourceId: operationsProposal.id,
        summary: operationsProposal.summary || `Đã nhập kho bổ sung +${totalRestocked} đơn vị hàng`,
      });

      setSuccessMessage(`✅ Đã phê duyệt và nhập kho thành công +${totalRestocked} đơn vị hàng vào cơ sở dữ liệu PostgreSQL!`);
      if (onTaskCreated) onTaskCreated();
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
        markCampaignCanceled(activeCampaignId);
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
  const activeAnalysisStep = analysisStep > 0 ? analysisStep : (isCurrentlyAnalyzing ? 1 : 0);

  const getDepartmentTasks = (dept: DepartmentType): DepartmentTask[] => {
    const inMem = departmentQueues[dept] || [];
    const dbTasks: DepartmentTask[] = (tasks?.items || [])
      .filter((t) => {
        const intent = detectStrategicIntent(t.goal);
        return intent === dept || (dept === "operations" && intent === "orchestration");
      })
      .map((t): DepartmentTask => {
        let status: DepartmentTask["status"] = "queued";
        if (t.state === "completed" || t.state === "partially_completed") {
          status = "completed";
        } else if (t.state === "failed" || t.state === "canceled") {
          status = "failed";
        } else if (t.state === "awaiting_plan_approval" || t.state === "awaiting_human_approval") {
          status = "queued";
        } else if (
          ["received", "planning", "dispatching", "department_analysis", "quality_review", "collaboration", "executive_synthesis", "retrying"].includes(t.state)
        ) {
          const taskTime = new Date(t.updatedAt || t.createdAt || 0).getTime();
          if (taskTime > 0 && Date.now() - taskTime > 4 * 3600 * 1000) {
            status = "failed";
          } else {
            status = "running";
          }
        } else {
          status = "queued";
        }
        return {
          id: t.id,
          prompt: t.goal,
          department: dept,
          requiredAgents: [],
          status,
          queuedAt: t.createdAt ? new Date(t.createdAt).getTime() : Date.now(),
        };
      });

    const seen = new Set<string>();
    const allDeptTasks: DepartmentTask[] = [];
    for (const item of [...inMem, ...dbTasks]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allDeptTasks.push(item);
      }
    }

    if (taskFilter === "running") {
      return allDeptTasks.filter((t) => t.status === "running");
    }
    if (taskFilter === "waiting_approval") {
      return allDeptTasks.filter((t) => {
        if (t.status !== "queued") return false;
        const dbTask = (tasks?.items || []).find((db) => db.id === t.id);
        if (dbTask) {
          return dbTask.state === "awaiting_plan_approval" || dbTask.state === "awaiting_human_approval";
        }
        return true;
      });
    }
    if (taskFilter === "completed") {
      return allDeptTasks.filter((t) => t.status === "completed");
    }
    if (taskFilter === "failed") {
      return allDeptTasks.filter((t) => t.status === "failed");
    }
    return allDeptTasks;
  };

  const marketingTasks = getDepartmentTasks("marketing");
  const merchandisingTasks = getDepartmentTasks("merchandising");
  const operationsTasks = getDepartmentTasks("operations");
  const supportTasks = getDepartmentTasks("support");

  const redesignedDepartmentCards: DepartmentCardProps[] = [
    {
      department: "marketing",
      displayName: "Tiếp thị & Sáng tạo",
      employeeCount: 3,
      activeTaskCount: marketingTasks.length,
      status: taskFilter === "running"
        ? (marketingTasks.length > 0 || deptStatus.marketing.activeAgent !== null || marketingActiveAgent?.startsWith("marketing") || isRunning ? "running" : "idle")
        : taskFilter === "waiting_approval"
        ? (marketingTasks.length > 0 || (activeCampaignDetail && ["campaign_review", "awaiting_human_approval", "revision_requested", "draft", "visual_creation"].includes(activeCampaignDetail.campaign.state)) ? "waiting_approval" : "idle")
        : taskFilter === "failed"
        ? (marketingTasks.length > 0 || (activeCampaignDetail?.campaign.state === "failed" || activeCampaignDetail?.campaign.state === "partial_failure") ? "error" : "idle")
        : taskFilter === "completed"
        ? "idle"
        : ((activeCampaignDetail && ["campaign_review", "awaiting_human_approval", "revision_requested", "draft", "visual_creation"].includes(activeCampaignDetail.campaign.state))
          ? "waiting_approval"
          : (activeCampaignDetail?.campaign.state === "failed" || activeCampaignDetail?.campaign.state === "partial_failure")
          ? "error"
          : (deptStatus.marketing.activeAgent !== null || marketingActiveAgent?.startsWith("marketing") || isRunning)
          ? "running"
          : "idle"),
      errorMessage: (activeCampaignDetail?.campaign.state === "failed" || activeCampaignDetail?.campaign.state === "partial_failure")
        ? (errorMessage || "Chiến dịch tiếp thị gặp sự cố khi xuất bản lên Facebook Page.")
        : (isFbTokenInvalid ? "Token kết nối Facebook Page đã hết hạn" : undefined),
      employees: [
        {
          id: "marketing_copywriter",
          name: "MKT-01",
          role: "Cây bút Sáng tạo",
          status: (deptStatus.marketing.activeAgent === "marketing_copywriter" || marketingActiveAgent === "marketing_copywriter" || activeLocks["marketing_copywriter"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.marketing.activeAgent === "marketing_copywriter" || marketingActiveAgent === "marketing_copywriter") ? Math.min(95, 25 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: (deptStatus.marketing.activeAgent === "marketing_copywriter" || marketingActiveAgent === "marketing_copywriter")
            ? (deptStatus.marketing.agentMessage ?? marketingAgentMessage ?? "Cây bút Sáng tạo đang soạn nội dung bài viết và hashtag...")
            : (deptStatus.marketing.completedAgents.includes("marketing_copywriter") ||
               marketingActiveAgent === "marketing_visual" ||
               marketingActiveAgent === "marketing_publisher")
            ? "Đã hoàn thành soạn thảo bài viết và bộ hashtag"
            : undefined,
          waitingTasksCount: getAgentWaitingTasksCount("marketing_copywriter"),
        },
        {
          id: "marketing_visual",
          name: "MKT-02",
          role: "Thiết kế Đồ họa",
          status: (deptStatus.marketing.activeAgent === "marketing_visual" || marketingActiveAgent === "marketing_visual" || marketingActiveAgent === "merchandising_visual_collab" || activeLocks["marketing_visual"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.marketing.activeAgent === "marketing_visual" || marketingActiveAgent === "marketing_visual" || marketingActiveAgent === "merchandising_visual_collab") ? Math.min(95, 20 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: (deptStatus.marketing.activeAgent === "marketing_visual" || marketingActiveAgent === "marketing_visual")
            ? (deptStatus.marketing.agentMessage ?? marketingAgentMessage ?? "Thiết kế Đồ họa đang dựng poster và banner...")
            : marketingActiveAgent === "merchandising_visual_collab"
            ? (marketingAgentMessage ?? "Đang phối hợp vẽ poster ưu đãi & badge 3D...")
            : (deptStatus.marketing.completedAgents.includes("marketing_visual") ||
               (activeCampaignDetail && (activeCampaignDetail.visualAssets.length > 0 || activeCampaignDetail.artifacts.length > 0)) ||
               marketingActiveAgent === "marketing_publisher")
            ? "Đã hoàn thành thiết kế poster & banner chiến dịch"
            : undefined,
          isCollaborating:
            (activeCollaboration?.fromDept === "merchandising" && activeCollaboration.toDept === "marketing") ||
            (activeCollaboration?.fromDept === "marketing" && activeCollaboration.toDept === "merchandising") ||
            marketingActiveAgent === "merchandising_visual_collab",
          collabTag: "Phối hợp cùng Danh mục",
          waitingTasksCount: getAgentWaitingTasksCount("marketing_visual"),
        },
        {
          id: "marketing_publisher",
          name: "MKT-03",
          role: "Điều phối Xuất bản",
          status: (activeCampaignDetail?.campaign.state === "failed") ? "failed" : (deptStatus.marketing.activeAgent === "marketing_publisher" || marketingActiveAgent === "marketing_publisher" || activeLocks["marketing_publisher"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.marketing.activeAgent === "marketing_publisher" || marketingActiveAgent === "marketing_publisher") ? Math.min(95, 30 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: (deptStatus.marketing.activeAgent === "marketing_publisher" || marketingActiveAgent === "marketing_publisher")
            ? (deptStatus.marketing.agentMessage ?? marketingAgentMessage ?? "Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage...")
            : (deptStatus.marketing.completedAgents.includes("marketing_publisher") ||
               activeCampaignDetail?.campaign.state === "completed")
            ? "Đã hoàn tất đăng bài lên Fanpage thành công"
            : undefined,
          waitingTasksCount: getAgentWaitingTasksCount("marketing_publisher"),
        },
      ],
      queue: marketingTasks,
      directInputMode,
      taskFilter,
      onTaskClick: (taskId) => navigate(`/agentic/tasks/${taskId}`),
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
      children: departmentQueues.marketing.length > 0 ? (
        <>
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
      ) : null,
      directInputPlaceholder: "Giao việc cho Tiếp thị & Sáng tạo...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("marketing", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => {
        if (activeCampaignDetail) {
          setMarketingCampaignModalOpen(true);
        } else if (isFbTokenInvalid || isFbTokenWarning) {
          setSocialTokenModalOpen(true);
        } else {
          navigate("/marketing/campaigns");
        }
      },
      onErrorResolve: () => {
        if (isFbTokenInvalid || isFbTokenWarning) {
          setSocialTokenModalOpen(true);
        } else {
          handleOpenDiagnostics("marketing");
        }
      },
    },
    {
      department: "merchandising",
      displayName: "Danh mục & Định giá",
      employeeCount: 2,
      activeTaskCount: merchandisingTasks.length,
      status: taskFilter === "running"
        ? (merchandisingTasks.length > 0 || deptStatus.merchandising.activeAgent !== null || marketingActiveAgent === "catalog_copywriter" || marketingActiveAgent === "pricing_strategist" ? "running" : "idle")
        : taskFilter === "waiting_approval"
        ? (merchandisingTasks.length > 0 || ((campaignProposal && !activeCampaign) || (merchandisingProposal && merchandisingProposal.status !== "applied")) ? "waiting_approval" : "idle")
        : taskFilter === "failed"
        ? (merchandisingTasks.length > 0 ? "error" : "idle")
        : taskFilter === "completed"
        ? "idle"
        : (((campaignProposal && !activeCampaign) || (merchandisingProposal && merchandisingProposal.status !== "applied"))
          ? "waiting_approval"
          : (deptStatus.merchandising.activeAgent !== null || marketingActiveAgent === "catalog_copywriter" || marketingActiveAgent === "pricing_strategist")
          ? "running"
          : "idle"),
      employees: [
        {
          id: "catalog_copywriter",
          name: "CAT-01",
          role: "Cây bút Sản phẩm",
          status: (deptStatus.merchandising.activeAgent === "catalog_copywriter" || marketingActiveAgent === "catalog_copywriter" || activeLocks["catalog_copywriter"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.merchandising.activeAgent === "catalog_copywriter" || marketingActiveAgent === "catalog_copywriter") ? Math.min(95, 25 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: (deptStatus.merchandising.activeAgent === "catalog_copywriter" || marketingActiveAgent === "catalog_copywriter")
            ? (deptStatus.merchandising.agentMessage ?? marketingAgentMessage ?? "Cây bút Sản phẩm đang tối ưu tiêu đề SEO...")
            : (deptStatus.merchandising.completedAgents.includes("catalog_copywriter") ||
               marketingActiveAgent === "pricing_strategist" ||
               marketingActiveAgent === "merchandising_visual_collab" ||
               (campaignProposal && !activeCampaign) ||
               (merchandisingProposal && merchandisingProposal.status !== "applied"))
            ? "Đã hoàn tất tối ưu tên & mô tả SEO"
            : undefined,
          waitingTasksCount: getAgentWaitingTasksCount("catalog_copywriter"),
        },
        {
          id: "pricing_strategist",
          name: "CAT-02",
          role: "Chuyên viên Định giá",
          status: (deptStatus.merchandising.activeAgent === "pricing_strategist" || marketingActiveAgent === "pricing_strategist" || activeLocks["pricing_strategist"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.merchandising.activeAgent === "pricing_strategist" || marketingActiveAgent === "pricing_strategist") ? Math.min(95, 30 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: (deptStatus.merchandising.activeAgent === "pricing_strategist" || marketingActiveAgent === "pricing_strategist")
            ? (deptStatus.merchandising.agentMessage ?? marketingAgentMessage ?? "Chuyên gia Định giá đang phân tích biên lợi nhuận...")
            : (deptStatus.merchandising.completedAgents.includes("pricing_strategist") ||
               (campaignProposal && !activeCampaign) ||
               (merchandisingProposal && merchandisingProposal.status !== "applied"))
            ? "Đã hoàn thành phân tích biên lợi nhuận & lập đề xuất Flash Sale"
            : undefined,
          waitingTasksCount: getAgentWaitingTasksCount("pricing_strategist"),
        },
      ],
      queue: merchandisingTasks,
      directInputMode,
      taskFilter,
      onTaskClick: (taskId) => navigate(`/agentic/tasks/${taskId}`),
      headerExtra: departmentQueues.merchandising.length > 0 ? (
        <span className="ccDeptQueueBadge">
          <Clock size={11} className="ccSpinSlow" />
          <span>Hàng chờ: {departmentQueues.merchandising.length}</span>
        </span>
      ) : null,
      children: (pendingHandoff?.dept === "merchandising" || departmentQueues.merchandising.length > 0) ? (
        <>
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
      ) : null,
      directInputPlaceholder: "Giao việc cho Danh mục & Định giá...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("merchandising", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => {
        if (campaignProposal) {
          setCampaignProposalModalOpen(true);
        } else if (activeCampaign) {
          const deliv = buildStrategicDeliverable(
            activeCampaign.name,
            activeCampaign.id,
            "merchandising",
          );
          setSelectedStrategicDeliverable(deliv);
          setIsStrategicModalOpen(true);
        } else {
          navigate("/products");
        }
      },
      onErrorResolve: () => handleOpenDiagnostics("merchandising"),
    },
    {
      department: "operations",
      displayName: "Vận hành & Kho vận",
      employeeCount: 2,
      activeTaskCount: operationsTasks.length,
      status: taskFilter === "running"
        ? (operationsTasks.length > 0 || deptStatus.operations.activeAgent !== null || marketingActiveAgent === "inventory_specialist" || marketingActiveAgent === "order_coordinator" ? "running" : "idle")
        : taskFilter === "waiting_approval"
        ? (operationsTasks.length > 0 || (operationsProposal && operationsProposal.status !== "applied") || pendingReplenishment ? "waiting_approval" : "idle")
        : taskFilter === "failed"
        ? (operationsTasks.length > 0 || (errorMessage && (activeWorkflowKind === "operations" || activeWorkflowKind === "orchestration")) ? "error" : "idle")
        : taskFilter === "completed"
        ? "idle"
        : ((errorMessage && (activeWorkflowKind === "operations" || activeWorkflowKind === "orchestration"))
          ? "error"
          : ((operationsProposal && operationsProposal.status !== "applied") || pendingReplenishment)
          ? "waiting_approval"
          : (deptStatus.operations.activeAgent !== null || marketingActiveAgent === "inventory_specialist" || marketingActiveAgent === "order_coordinator")
          ? "running"
          : "idle"),
      errorMessage: (errorMessage && (activeWorkflowKind === "operations" || activeWorkflowKind === "orchestration")) ? errorMessage : undefined,
      employees: [
        {
          id: "inventory_specialist",
          name: "OPS-01",
          role: "Kỹ sư Tồn kho",
          status: (errorMessage && (activeWorkflowKind === "operations" || activeWorkflowKind === "orchestration"))
            ? "failed"
            : (deptStatus.operations.activeAgent === "inventory_specialist" || marketingActiveAgent === "inventory_specialist" || marketingActiveAgent === "inventory_clearance_handoff" || activeLocks["inventory_specialist"] !== undefined)
            ? "working"
            : "idle",
          progressPercent: (deptStatus.operations.activeAgent === "inventory_specialist" || marketingActiveAgent === "inventory_specialist") ? Math.min(95, 25 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: deptStatus.operations.activeAgent === "inventory_specialist"
            ? deptStatus.operations.agentMessage ?? "Đang rà soát mức tồn kho thực tế và lượng giữ chỗ..."
            : marketingActiveAgent === "inventory_clearance_handoff"
            ? marketingAgentMessage ?? "Đang rà soát đối soát SKU tồn đọng để bàn giao sang Phòng Danh mục..."
            : marketingActiveAgent === "inventory_specialist"
            ? marketingAgentMessage ?? "Đang rà soát mức tồn kho thực tế và lượng giữ chỗ..."
            : (operationsProposal && operationsProposal.status !== "applied")
            ? "Đã kiểm toán dữ liệu SKU và phân loại rủi ro tồn kho"
            : undefined,
          isCollaborating:
            (activeCollaboration?.fromDept === "operations" && activeCollaboration.toDept === "merchandising") ||
            marketingActiveAgent === "inventory_clearance_handoff",
          collabTag: "Bàn giao liên phòng",
          waitingTasksCount: getAgentWaitingTasksCount("inventory_specialist"),
        },
        {
          id: "order_coordinator",
          name: "OPS-02",
          role: "Điều phối Đơn hàng",
          status: (deptStatus.operations.activeAgent === "order_coordinator" || marketingActiveAgent === "order_coordinator" || activeLocks["order_coordinator"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.operations.activeAgent === "order_coordinator" || marketingActiveAgent === "order_coordinator") ? Math.min(95, 30 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: deptStatus.operations.activeAgent === "order_coordinator"
            ? deptStatus.operations.agentMessage ?? "Đang tính toán tốc độ luân chuyển và lập báo cáo kiểm toán..."
            : marketingActiveAgent === "order_coordinator"
            ? marketingAgentMessage ?? "Đang tính toán tốc độ luân chuyển và lập báo cáo kiểm toán..."
            : (operationsProposal && operationsProposal.status !== "applied")
            ? "Đã hoàn thành lập dự toán ngân sách và xuất báo cáo kiểm toán Word"
            : undefined,
          waitingTasksCount: getAgentWaitingTasksCount("order_coordinator"),
        },
      ],
      queue: operationsTasks,
      directInputMode,
      taskFilter,
      onTaskClick: (taskId) => navigate(`/agentic/tasks/${taskId}`),
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
      children: (departmentQueues.operations.length > 0 || (operationsProposal && operationsProposal.status !== "applied")) ? (
        <>
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
          {operationsProposal && operationsProposal.status !== "applied" && (
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
      ) : null,
      directInputPlaceholder: "Giao việc cho Vận hành & Kho...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("operations", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => {
        if (pendingReplenishment || operationsProposal) {
          if (pendingReplenishment) setOperationsProposal(pendingReplenishment);
          setIsOperationsModalOpen(true);
        } else {
          navigate("/inventory");
        }
      },
      onErrorResolve: () => {
        if (pendingReplenishment) {
          setOperationsProposal(pendingReplenishment);
          setIsOperationsModalOpen(true);
        } else {
          handleOpenDiagnostics("operations");
        }
      },
    },
    {
      department: "support",
      displayName: "CSKH & Trải nghiệm",
      employeeCount: 2,
      activeTaskCount: supportTasks.length,
      status: taskFilter === "running"
        ? (supportTasks.length > 0 || deptStatus.support.activeAgent !== null || marketingActiveAgent === "support_steward" || marketingActiveAgent === "crm_specialist" ? "running" : "idle")
        : taskFilter === "waiting_approval"
        ? (supportTasks.length > 0 || (supportProposal && supportProposal.status !== "applied") ? "waiting_approval" : "idle")
        : taskFilter === "failed"
        ? (supportTasks.length > 0 ? "error" : "idle")
        : taskFilter === "completed"
        ? "idle"
        : ((supportProposal && supportProposal.status !== "applied")
          ? "waiting_approval"
          : (deptStatus.support.activeAgent !== null || marketingActiveAgent === "support_steward" || marketingActiveAgent === "crm_specialist")
          ? "running"
          : "idle"),
      employees: [
        {
          id: "support_steward",
          name: "SUP-01",
          role: "Quản gia CSKH",
          status: (deptStatus.support.activeAgent === "support_steward" || marketingActiveAgent === "support_steward" || activeLocks["support_steward"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.support.activeAgent === "support_steward" || marketingActiveAgent === "support_steward") ? Math.min(95, 25 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: (deptStatus.support.activeAgent === "support_steward" || marketingActiveAgent === "support_steward")
            ? (deptStatus.support.agentMessage ?? marketingAgentMessage ?? "Đang rà soát khiếu nại khách hàng & phân loại CSAT...")
            : (supportProposal && supportProposal.status === "pending_approval")
            ? "Đã phân tích toàn bộ khiếu nại & tính toán CSAT"
            : undefined,
          waitingTasksCount: getAgentWaitingTasksCount("support_steward"),
        },
        {
          id: "crm_specialist",
          name: "SUP-02",
          role: "Chuyên viên CRM",
          status: (deptStatus.support.activeAgent === "crm_specialist" || marketingActiveAgent === "crm_specialist" || activeLocks["crm_specialist"] !== undefined) ? "working" : "idle",
          progressPercent: (deptStatus.support.activeAgent === "crm_specialist" || marketingActiveAgent === "crm_specialist") ? Math.min(95, 30 + Math.floor((elapsedSeconds % 30) * 2.5)) : 0,
          statusText: (deptStatus.support.activeAgent === "crm_specialist" || marketingActiveAgent === "crm_specialist")
            ? (deptStatus.support.agentMessage ?? marketingAgentMessage ?? "Đang phân khúc nhóm khách hàng VIP & đề xuất voucher...")
            : (supportProposal && supportProposal.status === "pending_approval")
            ? "Đã lập kịch bản chăm sóc & đề xuất voucher cho khách VIP"
            : undefined,
          waitingTasksCount: getAgentWaitingTasksCount("crm_specialist"),
        },
      ],
      queue: supportTasks,
      directInputMode,
      taskFilter,
      onTaskClick: (taskId) => navigate(`/agentic/tasks/${taskId}`),
      headerExtra: departmentQueues.support.length > 0 ? (
        <span className="ccDeptQueueBadge">
          <Clock size={11} className="ccSpinSlow" />
          <span>Hàng chờ: {departmentQueues.support.length}</span>
        </span>
      ) : null,
      children: (
        departmentQueues.support.length > 0 ||
        (supportCampaignProposal && supportCampaignProposal.status === "pending_approval") ||
        (supportProposal && supportProposal.status === "pending_approval")
      ) ? (
        <>
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
          {supportCampaignProposal && supportCampaignProposal.status === "pending_approval" && (
            <button
              type="button"
              className="ccOperationsQuickBtn"
              style={{ marginTop: "0.25rem", width: "100%", justifyContent: "center", padding: "0.45rem 0.6rem", borderColor: "rgba(16, 185, 129, 0.4)", color: "#34d399" }}
              onClick={handleDownloadSupportCampaignDocx}
            >
              <FileText size={14} color="#10b981" />
              <span>Tải Kế Hoạch Chiến Dịch Email Word ({supportCampaignProposal.totalRecipients} KH)</span>
            </button>
          )}
          {supportProposal && supportProposal.status === "pending_approval" && (
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
      ) : null,
      directInputPlaceholder: "Giao việc cho CSKH & CRM...",
      onSendDirectTask: (text) => handleDepartmentDirectTask("support", text),
      onDirectDispatch: () => setDirectInputMode(true),
      onOpenDetails: () => navigate("/support"),
      onErrorResolve: () => handleOpenDiagnostics("support"),
    },
  ];

  const formatTime = (isoOrMs?: string | number) => {
    if (!isoOrMs) return new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const d = new Date(isoOrMs);
    return isNaN(d.getTime())
      ? new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })
      : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const redesignedApprovals: PendingApprovalItem[] = [
    // 1. Operations: Inventory Replenishment Proposal
    ...((operationsProposal && operationsProposal.status !== "applied")
      ? [
          {
            id: operationsProposal.id,
            title: `Phiếu đề xuất nhập kho: ${operationsProposal.items.length} SKU (${operationsProposal.totalRestockUnits} đơn vị)`,
            sourceDepartment: "operations" as const,
            authorName: "Kỹ sư Tồn kho (OPS-01)",
            riskLevel: "medium" as const,
            timestamp: formatTime(operationsProposal.createdAt),
            onPreview: () => {
              setOperationsProposal(operationsProposal);
              setIsOperationsModalOpen(true);
            },
            onRequestRevision: () => {
              void handleTriggerClearanceCampaign(operationsProposal.items);
            },
            onApprove: () => void handleApplyOperations(),
            onReject: async () => {
              const persisted = await persistCommandActivity({ department: "operations", decision: "canceled", resourceType: "operations_proposal", resourceId: operationsProposal.id, summary: operationsProposal.summary || "Đề xuất nhập kho" });
              if (!persisted) return;
              setOperationsProposal(null);
              setPendingReplenishment(null);
              setCompletedStrategicDeliverable(null);
              setStrategicDeliverableApproved(false);
              setCeoPlan(null);
              setActiveWorkflowKind("orchestration");
              setIsOperationsModalOpen(false);
              setSuccessMessage("Đã hủy đề xuất nhập kho.");
            },
          },
        ]
      : pendingReplenishment
      ? [
          {
            id: pendingReplenishment.id,
            title: `Kế hoạch nhập kho tự động: ${pendingReplenishment.items.length} SKU`,
            sourceDepartment: "operations" as const,
            authorName: "Kỹ sư Tồn kho (OPS-01)",
            riskLevel: "medium" as const,
            timestamp: formatTime(pendingReplenishment.createdAt),
            onPreview: () => {
              setOperationsProposal(pendingReplenishment);
              setIsOperationsModalOpen(true);
            },
            onRequestRevision: () => {
              void handleTriggerClearanceCampaign(pendingReplenishment.items);
            },
            onApprove: () => {
              setOperationsProposal(pendingReplenishment);
              void handleApplyOperations();
            },
            onReject: async () => {
              const persisted = await persistCommandActivity({ department: "operations", decision: "canceled", resourceType: "operations_proposal", resourceId: pendingReplenishment.id, summary: pendingReplenishment.summary || "Kế hoạch nhập kho tự động" });
              if (!persisted) return;
              setPendingReplenishment(null);
              setOperationsProposal(null);
              setCompletedStrategicDeliverable(null);
              setStrategicDeliverableApproved(false);
              setCeoPlan(null);
              setActiveWorkflowKind("orchestration");
              setIsOperationsModalOpen(false);
              setSuccessMessage("Đã hủy đề xuất nhập kho tự động.");
            },
          },
        ]
      : []),

    // 2. Marketing: Campaign Creative & Social Publication
    ...(() => {
      const items: PendingApprovalItem[] = [];
      const seenIds = new Set<string>();

      // Check activeCampaignDetail first
      if (
        activeCampaignDetail &&
        !canceledCampaignIds.has(activeCampaignDetail.campaign.id) &&
        activeCampaignDetail.campaign.state !== "canceled" &&
        [
          "awaiting_human_approval",
          "campaign_review",
          "revision_requested",
          "draft",
          "visual_creation",
          "failed",
          "partial_failure",
        ].includes(activeCampaignDetail.campaign.state)
      ) {
        seenIds.add(activeCampaignDetail.campaign.id);
        const isFailed =
          activeCampaignDetail.campaign.state === "failed" ||
          activeCampaignDetail.campaign.state === "partial_failure";
        items.push({
          id: activeCampaignDetail.campaign.id,
          title: isFailed
            ? `⚠️ [Cần xử lý] ${activeCampaignDetail.campaign.campaignName || "Chiến dịch Marketing Fanpage"} (Lỗi xuất bản)`
            : (activeCampaignDetail.campaign.campaignName || "Chiến dịch Marketing Fanpage"),
          sourceDepartment: "marketing" as const,
          authorName: isFailed ? "Hệ thống Xuất bản (Cần kiểm tra Token)" : "Cây bút Sáng tạo (MKT-01)",
          riskLevel: isFailed ? ("high" as const) : ("medium" as const),
          timestamp: formatTime(activeCampaignDetail.campaign.updatedAt),
          onPreview: () => {
            setActiveCampaignId(activeCampaignDetail.campaign.id);
            setPreviewCampaignDetail(activeCampaignDetail);
            setMarketingCampaignModalOpen(true);
          },
          onRequestRevision: () => {
            setActiveCampaignId(activeCampaignDetail.campaign.id);
            setPreviewCampaignDetail(activeCampaignDetail);
            setShowRevisionModal(true);
            setMarketingCampaignModalOpen(true);
          },
          onApprove: () => void handleApproveMarketing(activeCampaignDetail.campaign.id),
          onReject: () => void handleCancelMarketingCampaign(activeCampaignDetail.campaign.id),
        });
      }

      // Check all campaigns in campaignsList
      for (const camp of campaignsList) {
        if (seenIds.has(camp.id) || canceledCampaignIds.has(camp.id) || camp.state === "canceled") continue;
        if (
          [
            "awaiting_human_approval",
            "campaign_review",
            "revision_requested",
            "draft",
            "visual_creation",
            "failed",
            "partial_failure",
          ].includes(camp.state)
        ) {
          seenIds.add(camp.id);
          const isFailed = camp.state === "failed" || camp.state === "partial_failure";
          items.push({
            id: camp.id,
            title: isFailed
              ? `⚠️ [Cần xử lý] ${camp.campaignName || "Chiến dịch Marketing Fanpage"} (Lỗi xuất bản)`
              : (camp.campaignName || "Chiến dịch Marketing Fanpage"),
            sourceDepartment: "marketing" as const,
            authorName: isFailed ? "Hệ thống Xuất bản (Cần kiểm tra Token)" : "Cây bút Sáng tạo (MKT-01)",
            riskLevel: isFailed ? ("high" as const) : ("medium" as const),
            timestamp: formatTime(camp.updatedAt),
            onPreview: () => {
              setActiveCampaignId(camp.id);
              const detailToUse =
                activeCampaignDetail && activeCampaignDetail.campaign.id === camp.id
                  ? activeCampaignDetail
                  : buildFallbackMarketingDetail(camp);
              setPreviewCampaignDetail(detailToUse);
              setMarketingCampaignModalOpen(true);
              if (marketingApi?.getCampaign) {
                void marketingApi
                  .getCampaign(camp.id)
                  .then((d) => {
                    if (d) {
                      setPreviewCampaignDetail(d);
                      setActiveCampaignDetail(d);
                    }
                  })
                  .catch(() => {});
              }
            },
            onRequestRevision: () => {
              setActiveCampaignId(camp.id);
              const detailToUse =
                activeCampaignDetail && activeCampaignDetail.campaign.id === camp.id
                  ? activeCampaignDetail
                  : buildFallbackMarketingDetail(camp);
              setPreviewCampaignDetail(detailToUse);
              setShowRevisionModal(true);
              setMarketingCampaignModalOpen(true);
              if (marketingApi?.getCampaign) {
                void marketingApi
                  .getCampaign(camp.id)
                  .then((d) => {
                    if (d) {
                      setPreviewCampaignDetail(d);
                      setActiveCampaignDetail(d);
                    }
                  })
                  .catch(() => {});
              }
            },
            onApprove: () => void handleApproveMarketing(camp.id),
            onReject: () => void handleCancelMarketingCampaign(camp.id),
          });
        }
      }

      return items;
    })(),

    // 3. Merchandising: Flash Sale & Pricing Optimization Proposal
    ...((campaignProposal && !activeCampaign) || (merchandisingProposal && merchandisingProposal.status !== "applied")
      ? [
          {
            id: campaignProposal?.id || merchandisingProposal?.id || "merchandising-approval",
            title: campaignProposal?.name || "Đề xuất Flash Sale & Tối ưu Danh mục",
            sourceDepartment: "merchandising" as const,
            authorName: "Chuyên gia Định giá (MER-02)",
            riskLevel: "medium" as const,
            timestamp: formatTime(campaignProposal?.startTime || merchandisingProposal?.createdAt),
            onPreview: () => {
              if (!campaignProposal && merchandisingProposal) {
                setCampaignProposal(buildCampaignProposalFromMerchandising(merchandisingProposal));
              }
              setCampaignProposalModalOpen(true);
            },
            onRequestRevision: () => {
              setSuccessMessage("Đã chuyển yêu cầu điều chỉnh biên lợi nhuận cho Chuyên gia Định giá.");
            },
            onApprove: () => void handleApplyMerchandisingProposal(),
            onReject: async () => {
              const proposalId = campaignProposal?.id || merchandisingProposal?.id || "merchandising-approval";
              const proposalSummary = campaignProposal?.name || merchandisingProposal?.pricingRationale || "Đề xuất Flash Sale & Tối ưu Danh mục";
              const persisted = await persistCommandActivity({ department: "merchandising", decision: "canceled", resourceType: "merchandising_proposal", resourceId: proposalId, summary: proposalSummary });
              if (!persisted) return;
              setCampaignProposal(null);
              setMerchandisingProposal(null);
              setCompletedStrategicDeliverable(null);
              setStrategicDeliverableApproved(false);
              setCeoPlan(null);
              setActiveWorkflowKind("orchestration");
              setCampaignProposalModalOpen(false);
              setSuccessMessage("Đã hủy đề xuất Flash Sale & Tối ưu Danh mục.");
            },
          },
        ]
      : []),

    // 4a. Support: Proactive Email Campaign (New Products / Flash Sales / VIP)
    ...(supportCampaignProposal?.status === "pending_approval"
      ? [
          {
            id: supportCampaignProposal.id,
            title: `${supportCampaignProposal.title} (${supportCampaignProposal.totalRecipients} Khách hàng)`,
            sourceDepartment: "support" as const,
            authorName: "Chuyên viên CRM & Quản gia CSKH (SUP-02 & SUP-01)",
            riskLevel: "low" as const,
            timestamp: formatTime(supportCampaignProposal.createdAt || Date.now()),
            onPreview: () => {
              setIsSupportEmailApprovalModalOpen(false);
              setIsSupportCampaignModalOpen(true);
            },
            onRequestRevision: () => {
              setSuccessMessage("Đã chuyển yêu cầu điều chỉnh chiến dịch email cho Chuyên viên CRM.");
            },
            onApprove: () => void handleApplySupportCampaign(),
            onReject: async () => {
              const proposal = supportCampaignProposal;
              if (!supportApi?.cancelEmailCampaignProposal) {
                setErrorMessage("Dịch vụ chiến dịch email CSKH chưa sẵn sàng.");
                return;
              }
              try {
                await supportApi.cancelEmailCampaignProposal(proposal.id);
                setSupportCampaignProposal(null);
                setCompletedStrategicDeliverable(null);
                setStrategicDeliverableApproved(false);
                setCeoPlan(null);
                setActiveWorkflowKind("orchestration");
                setIsSupportCampaignModalOpen(false);
                await persistCommandActivity({
                  department: "support",
                  decision: "canceled",
                  resourceType: "support_proposal",
                  resourceId: proposal.id,
                  summary: `Đã từ chối chiến dịch email: ${proposal.title}`,
                });
                setSuccessMessage("Đã từ chối chiến dịch email CSKH.");
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Không thể từ chối chiến dịch email.");
              }
            },
          },
        ]
      : []),

    // 4b. Support: Customer Care Script & VIP Retention Vouchers
    ...(supportProposal?.status === "pending_approval"
      ? [
          {
            id: supportProposal.id,
            title: `Kịch bản phản hồi CSKH (${supportProposal.tickets.length} Ticket) & Voucher VIP`,
            sourceDepartment: "support" as const,
            authorName: "Chuyên viên CRM (SUP-02)",
            riskLevel: "low" as const,
            timestamp: formatTime(Date.now()),
            onPreview: () => {
              setIsSupportCampaignModalOpen(false);
              setIsSupportEmailApprovalModalOpen(true);
            },
            onRequestRevision: () => {
              setSuccessMessage("Đã chuyển yêu cầu điều chỉnh kịch bản CSKH cho Chuyên viên CRM.");
            },
            onApprove: () => void handleApplySupport(),
            onReject: async () => {
              const proposal = supportProposal;
              if (!supportApi) {
                setErrorMessage("Dịch vụ CSKH chưa sẵn sàng để hủy đề xuất.");
                return;
              }
              try {
                await supportApi.cancelSupportProposal(proposal.id);
                setSupportProposal(null);
                setCompletedStrategicDeliverable(null);
                setStrategicDeliverableApproved(false);
                setCeoPlan(null);
                setActiveWorkflowKind("orchestration");
                setIsSupportEmailApprovalModalOpen(false);
                const persisted = await persistCommandActivity({ department: "support", decision: "canceled", resourceType: "support_proposal", resourceId: proposal.id, summary: proposal.overallSentimentSummary || proposal.prompt || "Kịch bản phản hồi CSKH & Voucher VIP" });
                if (persisted) setSuccessMessage("Đã hủy đề xuất kịch bản CSKH & Voucher VIP.");
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Không thể hủy đề xuất CSKH.");
              }
            },
          },
        ]
      : []),

    // 5. AI CEO / Executive Deliverable: Strategic Cross-Department Execution Plan
    ...(completedStrategicDeliverable &&
    !strategicDeliverableApproved &&
    (completedStrategicDeliverable.department === "ai_ceo" ||
      (!operationsProposal && !campaignProposal && !supportProposal && !supportCampaignProposal && !activeCampaignDetail))
      ? [
          {
            id: completedStrategicDeliverable.id,
            title: `Phê duyệt Kế hoạch Thực thi: ${completedStrategicDeliverable.title}`,
            sourceDepartment: (completedStrategicDeliverable.department === "ai_ceo"
              ? "operations"
              : completedStrategicDeliverable.department) as DepartmentType,
            authorName: "AI CEO & Hội đồng Điều hành",
            riskLevel: "medium" as const,
            timestamp: formatTime(completedStrategicDeliverable.completedAt),
            onPreview: () => {
              setSelectedStrategicDeliverable(completedStrategicDeliverable);
              setIsStrategicModalOpen(true);
            },
            onRequestRevision: () => {
              setSuccessMessage("Đã gửi yêu cầu AI CEO điều chỉnh kế hoạch thực thi.");
            },
            onApprove: async () => {
              const deliverableDepartment = completedStrategicDeliverable.department === "ai_ceo" ? "operations" : completedStrategicDeliverable.department;
              const persisted = await persistCommandActivity({ department: deliverableDepartment, decision: "approved", resourceType: activityResourceType(deliverableDepartment), resourceId: completedStrategicDeliverable.id, summary: completedStrategicDeliverable.title });
              if (!persisted) return;
              setStrategicDeliverableApproved(true);
              setCeoPlan((prev) =>
                prev
                  ? {
                      ...prev,
                      steps: prev.steps.map((s) => ({ ...s, status: "done" })),
                    }
                  : null,
              );
              recordLiveEvent(
                "ai_ceo",
                "Chủ tịch đã phê duyệt kế hoạch thực thi",
                completedStrategicDeliverable.title,
                "success",
              );
              setSuccessMessage(`Đã phê duyệt kế hoạch thực thi "${completedStrategicDeliverable.title}" thành công!`);
            },
            onReject: async () => {
              const deliverable = completedStrategicDeliverable;
              const deliverableDepartment = deliverable.department === "ai_ceo" ? "operations" : deliverable.department;
              const persisted = await persistCommandActivity({ department: deliverableDepartment, decision: "canceled", resourceType: activityResourceType(deliverableDepartment), resourceId: deliverable.id, summary: deliverable.title });
              if (!persisted) return;
              setCompletedStrategicDeliverable(null);
              setSelectedStrategicDeliverable(null);
              setStrategicDeliverableApproved(false);
              setCeoPlan(null);
              setActiveWorkflowKind("orchestration");
              setIsStrategicModalOpen(false);
              setSuccessMessage("Đã hủy đề xuất kế hoạch thực thi.");
            },
          },
        ]
      : []),

    // 6. Backend Approvals (Agentic Approval Page Sync)
    ...apiApprovals.map((app) => {
      const foundTask = tasks?.items?.find((t) => t.id === app.taskId);
      const friendlyTitle =
        app.action === "agentic.workflow.complete"
          ? (foundTask
            ? `Nghiệm thu hoàn tất quy trình: ${foundTask.goal.length > 40 ? `${foundTask.goal.slice(0, 38)}...` : foundTask.goal}`
            : "Nghiệm thu hoàn tất quy trình tự động")
          : app.action === "configuration.activate"
          ? "Phê duyệt kích hoạt cấu hình quản trị số"
          : app.action.startsWith("tool.")
          ? `Xác nhận thực thi công cụ đặc quyền (${app.resourceType})`
          : `Yêu cầu phê duyệt: ${app.action} (${app.resourceType})`;

      const friendlyAuthor =
        app.requesterId === "system:workflow"
          ? "Bộ điều phối Quy trình Tự động (Workflow Engine)"
          : `Hệ thống (${app.requesterId || "AI Agent"})`;
      const approvalIntent = detectStrategicIntent(foundTask?.goal || `${app.action} ${app.resourceType}`);
      const approvalDepartment = (approvalIntent === "orchestration" ? "operations" : approvalIntent) as DepartmentType;

      return {
        id: app.id,
        title: friendlyTitle,
        sourceDepartment: approvalDepartment,
        authorName: friendlyAuthor,
        riskLevel: "medium" as const,
        timestamp: formatTime(app.createdAt),
        onPreview: () => {
          if (foundTask) {
            setSelectedStrategicDeliverable(buildStrategicDeliverable(foundTask.goal, foundTask.id, "ai_ceo"));
            setIsStrategicModalOpen(true);
          } else {
            navigate("/agentic/approvals");
          }
        },
        onRequestRevision: async () => {
          try {
            await api.decideApproval(app.id, { expectedVersion: app.version, decision: "revision_requested", reason: "Cần điều chỉnh thông số qua Command Center" });
            setApiApprovals((prev) => prev.filter((a) => a.id !== app.id));
            void refreshApprovals();
            setSuccessMessage("Đã yêu cầu chỉnh sửa đề xuất.");
          } catch (err: any) {
            if (err?.message?.includes("expired") || err?.code === "APPROVAL_EXPIRED" || err?.message?.includes("has expired")) {
              setApiApprovals((prev) => prev.filter((a) => a.id !== app.id));
              setSuccessMessage("Yêu cầu phê duyệt đã hết hạn hiệu lực và đã được đóng lại.");
            } else {
              setErrorMessage(err.message || "Không thể gửi yêu cầu chỉnh sửa.");
            }
          }
        },
        onApprove: async () => {
          try {
            await api.decideApproval(app.id, { expectedVersion: app.version, decision: "approved", reason: "Phê duyệt từ AI Command Center" });
            await persistCommandActivity({ department: approvalDepartment, decision: "approved", resourceType: activityResourceType(approvalDepartment), resourceId: app.id, summary: friendlyTitle });
            setApiApprovals((prev) => prev.filter((a) => a.id !== app.id));
            void refreshApprovals();
            setSuccessMessage("Đã phê duyệt đề xuất thành công!");
          } catch (err: any) {
            if (err?.message?.includes("expired") || err?.code === "APPROVAL_EXPIRED" || err?.message?.includes("has expired")) {
              setApiApprovals((prev) => prev.filter((a) => a.id !== app.id));
              setSuccessMessage("Yêu cầu phê duyệt đã hết hạn hiệu lực và đã được đóng lại.");
            } else {
              setErrorMessage(err.message || "Phê duyệt thất bại.");
            }
          }
        },
        onReject: async () => {
          try {
            await api.decideApproval(app.id, {
              expectedVersion: app.version,
              decision: "rejected",
              reason: "Hủy duyệt từ AI Command Center",
            });
            await persistCommandActivity({ department: approvalDepartment, decision: "canceled", resourceType: activityResourceType(approvalDepartment), resourceId: app.id, summary: friendlyTitle });
            setApiApprovals((prev) => prev.filter((a) => a.id !== app.id));
            void refreshApprovals();
            setSuccessMessage("Đã hủy duyệt đề xuất.");
          } catch (err: any) {
            if (err?.message?.includes("expired") || err?.code === "APPROVAL_EXPIRED" || err?.message?.includes("has expired")) {
              setApiApprovals((prev) => prev.filter((a) => a.id !== app.id));
              setSuccessMessage("Yêu cầu phê duyệt đã hết hạn hiệu lực và đã được đóng lại.");
            } else {
              setErrorMessage(err.message || "Không thể hủy duyệt đề xuất.");
            }
          }
        },
      };
    }),

    // 7. Tasks in items waiting for human approval
    ...(tasks?.items ?? [])
      .filter((t) => (t.state === "awaiting_human_approval" || t.state === "awaiting_plan_approval") && !apiApprovals.some((a) => a.taskId === t.id))
      .map((t) => {
        const intent = detectStrategicIntent(t.goal);
        const dept = (intent === "orchestration" ? "operations" : intent) as DepartmentType;
        return {
          id: t.id,
          title: `Phê duyệt tác vụ: ${t.goal}`,
          sourceDepartment: dept,
          authorName: "Tổng Giám Đốc AI (AI CEO)",
          riskLevel: "medium" as const,
          timestamp: formatTime(t.createdAt),
          onPreview: () => {
            setSelectedStrategicDeliverable(buildStrategicDeliverable(t.goal, t.id, "ai_ceo"));
            setIsStrategicModalOpen(true);
          },
          onRequestRevision: () => {
            setSuccessMessage("Đã yêu cầu điều chỉnh tác vụ.");
          },
          onApprove: async () => {
            try {
              if (api?.startTask) {
                await api.startTask(t.id, t.version, 1);
              }
              await persistCommandActivity({ department: dept, decision: "approved", resourceType: activityResourceType(dept), resourceId: t.id, summary: t.goal });
              if (onTaskCreated) onTaskCreated();
              setSuccessMessage(`Đã phê duyệt và tiếp tục thực thi tác vụ "${t.goal.slice(0, 40)}..."!`);
            } catch (err: any) {
              setErrorMessage(err?.message || "Lỗi phê duyệt tác vụ.");
            }
          },
          onReject: async () => {
            const persisted = await persistCommandActivity({ department: dept, decision: "canceled", resourceType: activityResourceType(dept), resourceId: t.id, summary: t.goal });
            if (!persisted) return;
            markTaskReviewed(t.id);
            setSuccessMessage(`Đã hủy duyệt tác vụ "${t.goal.slice(0, 40)}...".`);
          },
        };
      }),

    // 8. Completed tasks awaiting user review / inspection
    ...(tasks?.items ?? [])
      .filter(
        (t) =>
          (t.state === "completed" || t.state === "partially_completed") &&
          !reviewedTaskIds.has(t.id) &&
          !apiApprovals.some((a) => a.taskId === t.id)
      )
      .slice(0, 3)
      .map((t) => {
        const intent = detectStrategicIntent(t.goal);
        const dept = (intent === "orchestration" ? "operations" : intent) as DepartmentType;
        return {
          id: `review-${t.id}`,
          title: `Nghiệm thu kết quả: ${t.goal.length > 50 ? `${t.goal.slice(0, 47)}...` : t.goal}`,
          sourceDepartment: dept,
          authorName: "Báo cáo Hoàn tất Tác vụ",
          riskLevel: "low" as const,
          timestamp: formatTime(t.updatedAt || t.createdAt),
          onPreview: () => {
            markTaskReviewed(t.id);
            setSelectedStrategicDeliverable(
              buildStrategicDeliverable(t.goal, t.id, (intent === "orchestration" ? "ai_ceo" : intent) as any)
            );
            setIsStrategicModalOpen(true);
          },
          onRequestRevision: () => {
            markTaskReviewed(t.id);
            setSuccessMessage("Đã chuyển phản hồi nghiệm thu cho nhân sự số.");
          },
          onApprove: async () => {
            const persisted = await persistCommandActivity({ department: dept, decision: "approved", resourceType: activityResourceType(dept), resourceId: t.id, summary: t.goal });
            if (!persisted) return;
            markTaskReviewed(t.id);
            setSuccessMessage(`Đã nghiệm thu kết quả tác vụ "${t.goal.slice(0, 35)}..." thành công!`);
          },
          onReject: async () => {
            const persisted = await persistCommandActivity({ department: dept, decision: "canceled", resourceType: activityResourceType(dept), resourceId: t.id, summary: t.goal });
            if (!persisted) return;
            markTaskReviewed(t.id);
            setSuccessMessage(`Đã bỏ qua nghiệm thu kết quả tác vụ "${t.goal.slice(0, 35)}...".`);
          },
        };
      }),
  ];

  const displayedStrategicDeliverable =
    selectedStrategicDeliverable || completedStrategicDeliverable;
  const displayedApprovalId = displayedStrategicDeliverable
    ? redesignedApprovals.find((approval) => {
        if (approval.id === displayedStrategicDeliverable.taskId) return true;
        if (approval.id === `review-${displayedStrategicDeliverable.taskId}`) return true;
        return apiApprovals.some(
          (apiApproval) =>
            apiApproval.id === approval.id &&
            apiApproval.taskId === displayedStrategicDeliverable.taskId,
        );
      })?.id
    : undefined;

  const redesignedRecentDeliverables = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      departmentName: string;
      completedAt: string;
      format: string;
      timestamp: number;
      onDownloadOrView: () => void;
    }> = [];

    if (completedStrategicDeliverable) {
      list.push({
        id: completedStrategicDeliverable.id,
        title: completedStrategicDeliverable.title,
        departmentName: "AI CEO",
        completedAt: formatTime(completedStrategicDeliverable.completedAt),
        format: "docx",
        timestamp: new Date(completedStrategicDeliverable.completedAt).getTime(),
        onDownloadOrView: () => {
          setSelectedStrategicDeliverable(completedStrategicDeliverable);
          setIsStrategicModalOpen(true);
        },
      });
    }

    const effectiveActiveCampaigns = activeCampaigns.length > 0
      ? activeCampaigns
      : activeCampaign ? [activeCampaign] : [];
    for (const camp of effectiveActiveCampaigns) {
      list.push({
        id: camp.id,
        title: `Báo cáo: Chiến dịch ${camp.name}`,
        departmentName: "Danh mục & Định giá",
        completedAt: formatTime(camp.startTime),
        format: "docx",
        timestamp: new Date(camp.startTime).getTime(),
        onDownloadOrView: () => {
          void handleOpenCampaignDeliverable(camp.id, true);
        },
      });
    }

    if (activeCampaignDetail && activeCampaignDetail.campaign.state === "completed") {
      const camp = activeCampaignDetail.campaign;
      const title = camp.campaignName || camp.objective || "Chiến dịch Truyền thông & Visual Fanpage";
      list.push({
        id: `active-camp-${camp.id}`,
        title: title.startsWith("Chiến dịch") || title.startsWith("Báo cáo") ? title : `Báo cáo: ${title}`,
        departmentName: "Tiếp thị & Sáng tạo",
        completedAt: formatTime(camp.updatedAt || camp.createdAt),
        format: "docx",
        timestamp: new Date(camp.updatedAt || camp.createdAt).getTime(),
        onDownloadOrView: () => {
          setMarketingCampaignModalOpen(true);
        },
      });
    }

    for (const c of campaignsList) {
      if (c.state === "completed") {
        const title = c.campaignName || c.objective || "Chiến dịch Truyền thông & Visual Fanpage";
        list.push({
          id: `camp-${c.id}`,
          title: title.startsWith("Chiến dịch") || title.startsWith("Báo cáo") ? title : `Báo cáo: ${title}`,
          departmentName: "Tiếp thị & Sáng tạo",
          completedAt: formatTime(c.updatedAt || c.createdAt),
          format: "docx",
          timestamp: new Date(c.updatedAt || c.createdAt).getTime(),
          onDownloadOrView: () => {
            setActiveCampaignId(c.id);
            if (marketingApi?.getCampaign) {
              void marketingApi.getCampaign(c.id).then((d) => {
                if (d) {
                  setActiveCampaignDetail(d);
                  setPreviewCampaignDetail(d);
                }
              }).catch(() => {});
            }
            setMarketingCampaignModalOpen(true);
          },
        });
      }
    }

    if (operationsProposal) {
      list.push({
        id: operationsProposal.id,
        title: operationsProposal.docxFilename || "Báo cáo Kiểm toán Tồn kho & Đề xuất Nhập hàng",
        departmentName: "Vận hành & Kho vận",
        completedAt: formatTime(operationsProposal.createdAt),
        format: "docx",
        timestamp: new Date(operationsProposal.createdAt).getTime(),
        onDownloadOrView: () => {
          const deliv = buildStrategicDeliverable(
            operationsProposal.summary || "Báo cáo Kiểm toán Tồn kho & Đề xuất Nhập hàng",
            operationsProposal.id,
            "operations",
          );
          setSelectedStrategicDeliverable(deliv);
          setIsStrategicModalOpen(true);
        },
      });
    }

    if (supportProposal) {
      list.push({
        id: supportProposal.id,
        title: supportProposal.docxFilename || "Báo cáo Phân tích CSKH & Khách hàng VIP",
        departmentName: "CSKH & Trải nghiệm",
        completedAt: formatTime(Date.now()),
        format: "docx",
        timestamp: Date.now(),
        onDownloadOrView: () => {
          const deliv = buildStrategicDeliverable(
            supportProposal.overallSentimentSummary || supportProposal.prompt || "Báo cáo Phân tích CSKH & Khách hàng VIP",
            supportProposal.id,
            "support",
          );
          setSelectedStrategicDeliverable(deliv);
          setIsStrategicModalOpen(true);
        },
      });
    }

    if (supportCampaignProposal) {
      list.push({
        id: supportCampaignProposal.id,
        title: supportCampaignProposal.docxFilename || `Kế hoạch Email: ${supportCampaignProposal.title}`,
        departmentName: "CSKH & Trải nghiệm",
        completedAt: formatTime(supportCampaignProposal.updatedAt || supportCampaignProposal.createdAt || Date.now()),
        format: "docx",
        timestamp: new Date(supportCampaignProposal.updatedAt || supportCampaignProposal.createdAt).getTime() || Date.now(),
        onDownloadOrView: () => {
          setIsSupportEmailApprovalModalOpen(false);
          setIsSupportCampaignModalOpen(true);
        },
      });
    }

    const completed = (tasks?.items ?? []).filter(
      (t) => t.state === "completed" || t.state === "partially_completed"
    );
    for (const t of completed) {
      const intent = detectStrategicIntent(t.goal);
      const deptName =
        intent === "marketing"
          ? "Tiếp thị & Sáng tạo"
          : intent === "merchandising"
          ? "Danh mục & Định giá"
          : intent === "support"
          ? "CSKH & Trải nghiệm"
          : intent === "orchestration"
          ? "AI CEO"
          : "Vận hành & Kho vận";
      const formattedGoal = t.goal.replace(/^([hH]ãy|[hH]ayx)\s*(lên\s*)?/i, "Lên ").trim();
      const capitalized = formattedGoal.charAt(0).toUpperCase() + formattedGoal.slice(1);
      const displayTitle = capitalized.startsWith("Báo cáo")
        ? (capitalized.length > 42 ? `${capitalized.slice(0, 39)}...` : capitalized)
        : `Báo cáo: ${capitalized.length > 36 ? `${capitalized.slice(0, 33)}...` : capitalized}`;
      list.push({
        id: t.id,
        title: displayTitle,
        departmentName: deptName,
        completedAt: formatTime(t.updatedAt || t.createdAt),
        format: "docx",
        timestamp: new Date(t.updatedAt || t.createdAt).getTime(),
        onDownloadOrView: () => {
          const deliv = buildStrategicDeliverable(t.goal, t.id);
          setSelectedStrategicDeliverable(deliv);
          setIsStrategicModalOpen(true);
        },
      });
    }

    const map = new Map<string, typeof list[0]>();
    for (const item of list) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
  }, [
    completedStrategicDeliverable,
    activeCampaign,
    activeCampaigns,
    activeCampaignDetail,
    campaignsList,
    operationsProposal,
    supportProposal,
    tasks?.items,
    marketingApi,
  ]);

  const dbRunningCount = (tasks?.items ?? []).filter((t) => {
    if (!["received", "planning", "dispatching", "department_analysis", "quality_review", "collaboration", "executive_synthesis", "retrying"].includes(t.state)) {
      return false;
    }
    const taskTime = new Date(t.updatedAt || t.createdAt || 0).getTime();
    if (taskTime > 0 && Date.now() - taskTime > 4 * 3600 * 1000) {
      return false;
    }
    return true;
  }).length;
  const inMemRunningCount = Object.values(departmentQueues)
    .flat()
    .filter((t) => t.status === "running" && !tasks?.items?.some((db) => db.id === t.id)).length;
  const hasActiveAgentRunning = (Object.values(deptStatus).some((d) => d.activeAgent !== null) || isRunning) ? 1 : 0;

  const runningCount = (tasks?.items && tasks.items.length > 0)
    ? (dbRunningCount + inMemRunningCount + hasActiveAgentRunning)
    : Math.max(overview?.counts?.running ?? 0, dbRunningCount + inMemRunningCount + hasActiveAgentRunning);

  const dbWaitingApprovalCount = (tasks?.items ?? []).filter(
    (t) => t.state === "awaiting_plan_approval" || t.state === "awaiting_human_approval"
  ).length;
  const inMemWaitingApprovalCount = Object.values(departmentQueues)
    .flat()
    .filter((t) => t.status === "queued" && !tasks?.items?.some((db) => db.id === t.id)).length;

  const waitingApprovalCount = Math.max(
    overview?.pendingApprovals ?? 0,
    redesignedApprovals.length,
    dbWaitingApprovalCount + inMemWaitingApprovalCount
  );

  const completedTasksList = (tasks?.items ?? []).filter(
    (t) => t.state === "completed" || t.state === "partially_completed"
  );
  const canceledTasksList = (tasks?.items ?? []).filter((t) => t.state === "canceled");

  // Non-agentic completed deliverables across departments
  const completedMarketingCount = campaignsList.filter(
    (c) => c.state === "completed" && !tasks?.items?.some((t) => t.id === c.id)
  ).length;
  const completedStrategicCount =
    completedStrategicDeliverable && !tasks?.items?.some((t) => t.id === completedStrategicDeliverable.id) ? 1 : 0;
  const completedOpsCount =
    operationsProposal?.status === "applied" && !tasks?.items?.some((t) => t.id === operationsProposal.id) ? 1 : 0;
  const completedSupportCount =
    ((supportProposal?.status === "applied" && !tasks?.items?.some((t) => t.id === supportProposal.id)) ? 1 : 0) +
    (((supportCampaignProposal?.status === "sent" || supportCampaignProposal?.status === "approved") && !tasks?.items?.some((t) => t.id === supportCampaignProposal.id)) ? 1 : 0);

  const extraCompletedCount =
    completedMarketingCount +
    completedStrategicCount +
    completedOpsCount +
    completedSupportCount;

  const baseCompletedCount = overview?.counts?.completed !== undefined
    ? Math.max(overview.counts.completed + ((tasks?.items ?? []).filter((t) => t.state === "partially_completed").length), completedTasksList.length)
    : completedTasksList.length;

  const completedCount = baseCompletedCount + extraCompletedCount;

  const dbFailedCount = (tasks?.items ?? []).filter(
    (t) => t.state === "failed" || t.state === "canceled"
  ).length;

  const failedCount = (tasks?.items && tasks.items.length > 0)
    ? dbFailedCount + (errorMessage ? 1 : 0)
    : (overview?.counts?.failed ?? 0) + (overview?.counts?.canceled ?? 0) + (errorMessage ? 1 : 0);

  const allCount = runningCount + waitingApprovalCount + completedCount + failedCount;

  // Determine SLA on-time vs delayed among completed tasks
  const onTimeCompleted = completedTasksList.filter((t) => t.state === "completed").length + extraCompletedCount;
  const delayedCompleted = completedTasksList.filter((t) => t.state === "partially_completed").length;

  const totalEvaluated = completedTasksList.length + canceledTasksList.length + extraCompletedCount;
  const onTimePercent = totalEvaluated > 0
    ? Math.round((onTimeCompleted / totalEvaluated) * 100)
    : (completedCount > 0 ? 82 : 0);
  const delayedPercent = totalEvaluated > 0
    ? Math.round((delayedCompleted / totalEvaluated) * 100)
    : (completedCount > 0 ? 11 : 0);
  const cancelledPercent = totalEvaluated > 0
    ? Math.max(0, 100 - onTimePercent - delayedPercent)
    : (completedCount > 0 ? 7 : 0);

  const calculateDeptEfficiency = (dept: DepartmentType) => {
    const deptBaselines: Record<DepartmentType, number> = {
      marketing: 92,
      merchandising: 78,
      operations: 65,
      support: 88,
    };
    const baseReadiness = deptBaselines[dept];
    const deptTasks = (tasks?.items ?? []).filter((t) => {
      const intent = detectStrategicIntent(t.goal);
      return intent === dept;
    });
    const extraFinished = dept === "marketing" ? completedMarketingCount : 0;
    const finishedTasks = deptTasks.filter(
      (t) => t.state === "completed" || t.state === "partially_completed" || t.state === "failed" || t.state === "canceled"
    );
    const totalFinished = finishedTasks.length + extraFinished;
    if (totalFinished === 0) {
      return baseReadiness;
    }
    const successCount = finishedTasks.filter((t) => t.state === "completed" || t.state === "partially_completed").length + extraFinished;
    const successRate = (successCount / totalFinished) * 100;
    return Math.min(100, Math.max(30, Math.round(baseReadiness * 0.85 + successRate * 0.15)));
  };

  const departmentEfficiencies = [
    { department: "marketing" as const, displayName: "Tiếp thị & Sáng tạo", efficiencyPercent: calculateDeptEfficiency("marketing") },
    { department: "merchandising" as const, displayName: "Danh mục & Định giá", efficiencyPercent: calculateDeptEfficiency("merchandising") },
    { department: "operations" as const, displayName: "Vận hành & Kho vận", efficiencyPercent: calculateDeptEfficiency("operations") },
    { department: "support" as const, displayName: "CSKH & Trải nghiệm", efficiencyPercent: calculateDeptEfficiency("support") },
  ];

  const completedTasksWithTimes = (tasks?.items ?? []).filter(
    (t) => (t.state === "completed" || t.state === "partially_completed") && t.createdAt && t.updatedAt
  );
  const avgDurationSeconds = completedTasksWithTimes.length > 0
    ? Math.round(
        completedTasksWithTimes.reduce((acc, t) => {
          const diffMs = Math.max(0, new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime());
          return acc + diffMs / 1000;
        }, 0) / completedTasksWithTimes.length
      )
    : (elapsedSeconds > 0 ? elapsedSeconds : 28);

  const avgDurationDisplay = avgDurationSeconds >= 3600
    ? `${(avgDurationSeconds / 3600).toFixed(1)}h`
    : avgDurationSeconds >= 60
    ? `${(avgDurationSeconds / 60).toFixed(1)}m`
    : `${Math.max(1, avgDurationSeconds)}s`;

  const avgDurationHours = Number((avgDurationSeconds / 3600).toFixed(1));

  const totalApprovalsCount = (overview?.pendingApprovals ?? 0) + (overview?.counts?.completed ?? 0);
  const approvalRatePercent = totalApprovalsCount > 0
    ? Math.round(((overview?.counts?.completed ?? 0) / totalApprovalsCount) * 100)
    : 96;

  const filteredDepartmentCards = redesignedDepartmentCards;

  const filteredLiveEvents = useMemo(() => {
    return liveEvents.filter((ev) => {
      if (liveFeedFilter !== "all" && ev.department !== liveFeedFilter) {
        return false;
      }
      const titleLower = ev.title.toLowerCase();
      const descLower = ev.description.toLowerCase();

      if (taskFilter === "running") {
        const isCompleted = titleLower.includes("hoàn tất") || titleLower.includes("hoàn thành") || descLower.includes("completed");
        const isError = titleLower.includes("lỗi") || titleLower.includes("hủy") || titleLower.includes("quá hạn") || titleLower.includes("gián đoạn") || descLower.includes("failed") || ev.status === "error";
        const isWaiting = titleLower.includes("phê duyệt") || titleLower.includes("chờ") || descLower.includes("approval") || ev.status === "warning";
        if (isCompleted || isError || isWaiting) return false;

        return (
          ev.status === "info" ||
          titleLower.includes("đang") ||
          titleLower.includes("thực thi") ||
          titleLower.includes("tiếp nhận") ||
          descLower.includes("đang") ||
          descLower.includes("running") ||
          descLower.includes("planning")
        );
      }
      if (taskFilter === "waiting_approval") {
        return ev.status === "warning" || descLower.includes("approval") || titleLower.includes("phê duyệt") || titleLower.includes("chờ");
      }
      if (taskFilter === "completed") {
        return ev.status === "success" || descLower.includes("completed") || titleLower.includes("hoàn thành") || titleLower.includes("hoàn tất");
      }
      if (taskFilter === "failed") {
        return ev.status === "error" || descLower.includes("failed") || titleLower.includes("lỗi") || titleLower.includes("hủy") || titleLower.includes("quá hạn") || titleLower.includes("gián đoạn");
      }
      return true;
    });
  }, [liveEvents, liveFeedFilter, taskFilter]);

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
          all: allCount,
          running: runningCount,
          waiting_approval: waitingApprovalCount,
          completed: completedCount,
          failed: failedCount,
        }}
        onNewTaskClick={() => {
          const textarea = (document.querySelector(".ccStrategicTextarea") ||
            document.querySelector(".ccComposerTextarea")) as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.focus();
            textarea.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            handleSendStrategicTask();
          }
        }}
        onDirectModeToggle={() => setDirectInputMode((prev) => !prev)}
        directInputMode={directInputMode}
      />

      {/* TIER 1: Command Composer Panel & AI CEO Stepper */}
      <CommandComposerPanel
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={(meta) => handleSendStrategicTask(meta)}
        onStop={handleStopStrategicTask}
        isSubmitting={isSubmitting}
        isAnalyzing={isCurrentlyAnalyzing}
        analysisStep={activeAnalysisStep}
        analysisDurationSeconds={elapsedSeconds}
        priority={composerPriority}
        onPriorityChange={setComposerPriority}
        targetDepartment={composerTarget}
        onTargetDepartmentChange={setComposerTarget}
        onSelectTemplate={(tmpl) => {
          setPrompt(tmpl.prompt);
          if (tmpl.target) setComposerTarget(tmpl.target);
          if (tmpl.priority) setComposerPriority(tmpl.priority);
          handleSendStrategicTask({
            prompt: tmpl.prompt,
            target: tmpl.target,
            priority: tmpl.priority,
          });
        }}
        ceoPlan={ceoPlan}
        onResetCeoPlan={() => {
          setCeoPlan(null);
          setElapsedSeconds(0);
          setAnalysisStep(0);
          setCompletedStrategicDeliverable(null);
          setSelectedStrategicDeliverable(null);
          setActiveWorkflowKind("orchestration");
        }}
        onViewDeliverable={() => {
          const dept = activeWorkflowKind || "";
          const targetDept = ceoPlan?.targetDept || "";
          const isSupport =
            dept === "support" ||
            targetDept.includes("CSKH") ||
            targetDept.includes("Chăm sóc") ||
            targetDept.includes("CRM");
          const isOperations =
            dept === "operations" ||
            targetDept.includes("Vận hành") ||
            targetDept.includes("Kho") ||
            targetDept.includes("Cung ứng");
          const isMarketing =
            dept === "marketing" ||
            targetDept.includes("Tiếp thị") ||
            targetDept.includes("Truyền thông") ||
            targetDept.includes("Sáng tạo");
          const isMerchandising =
            dept === "merchandising" ||
            targetDept.includes("Kinh doanh") ||
            targetDept.includes("Định giá") ||
            targetDept.includes("Danh mục");

          // 1. Support Department: CSKH Email Campaigns & Support Tickets
          if (isSupport) {
            if (supportCampaignProposal) {
              setIsSupportEmailApprovalModalOpen(false);
              setIsSupportCampaignModalOpen(true);
            } else if (supportProposal) {
              setIsSupportCampaignModalOpen(false);
              setIsSupportEmailApprovalModalOpen(true);
            } else if (
              completedStrategicDeliverable?.department === "support" ||
              selectedStrategicDeliverable?.department === "support"
            ) {
              setIsStrategicModalOpen(true);
            } else {
              const deliv = buildStrategicDeliverable(
                ceoPlan?.goal || "Chiến dịch CSKH & CRM",
                undefined,
                "support",
              );
              setSelectedStrategicDeliverable(deliv);
              setIsStrategicModalOpen(true);
            }
            return;
          }

          // 2. Operations Department: Replenishment & Inventory Audits
          if (isOperations) {
            if (operationsProposal) {
              setIsOperationsModalOpen(true);
            } else if (pendingReplenishment) {
              setOperationsProposal(pendingReplenishment);
              setIsOperationsModalOpen(true);
            } else if (
              completedStrategicDeliverable?.department === "operations" ||
              selectedStrategicDeliverable?.department === "operations"
            ) {
              setIsStrategicModalOpen(true);
            } else {
              const deliv = buildStrategicDeliverable(
                ceoPlan?.goal || "Kiểm toán vận hành & tồn kho",
                undefined,
                "operations",
              );
              setSelectedStrategicDeliverable(deliv);
              setIsStrategicModalOpen(true);
            }
            return;
          }

          // 3. Marketing Department: Content, Visual, Publishing Campaigns
          if (isMarketing) {
            if (activeCampaignDetail) {
              setMarketingCampaignModalOpen(true);
            } else if (activeCampaignId) {
              setMarketingCampaignModalOpen(true);
            } else if (
              completedStrategicDeliverable?.department === "marketing" ||
              selectedStrategicDeliverable?.department === "marketing"
            ) {
              setIsStrategicModalOpen(true);
            } else {
              const deliv = buildStrategicDeliverable(
                ceoPlan?.goal || "Kế hoạch Tiếp thị & Truyền thông",
                activeCampaignId || undefined,
                "marketing",
              );
              setSelectedStrategicDeliverable(deliv);
              setIsStrategicModalOpen(true);
            }
            return;
          }

          // 4. Merchandising Department: Flash Sales, Pricing, Catalog
          if (isMerchandising) {
            if (campaignProposal) {
              setCampaignProposalModalOpen(true);
            } else if (merchandisingProposal) {
              const deliv = buildStrategicDeliverable(
                ceoPlan?.goal || "Đề xuất danh mục & Flash Sale",
                merchandisingProposal.id,
                "merchandising",
              );
              setSelectedStrategicDeliverable(deliv);
              setIsStrategicModalOpen(true);
            } else if (activeCampaign) {
              void handleOpenCampaignDeliverable(activeCampaign.id, true);
            } else if (
              completedStrategicDeliverable?.department === "merchandising" ||
              selectedStrategicDeliverable?.department === "merchandising"
            ) {
              setIsStrategicModalOpen(true);
            }
            return;
          }

          // 5. Fallback / AI CEO Orchestration
          if (completedStrategicDeliverable || selectedStrategicDeliverable) {
            setIsStrategicModalOpen(true);
          } else if (supportCampaignProposal) {
            setIsSupportEmailApprovalModalOpen(false);
            setIsSupportCampaignModalOpen(true);
          } else if (supportProposal) {
            setIsSupportCampaignModalOpen(false);
            setIsSupportEmailApprovalModalOpen(true);
          } else if (operationsProposal || pendingReplenishment) {
            if (pendingReplenishment && !operationsProposal) {
              setOperationsProposal(pendingReplenishment);
            }
            setIsOperationsModalOpen(true);
          } else if (activeCampaignDetail) {
            setMarketingCampaignModalOpen(true);
          } else if (campaignProposal) {
            setCampaignProposalModalOpen(true);
          }
        }}
      />

      {/* Active Merchandising Campaign Live Horizontal Banner (Tier 1 -> Tier 2 Transition) */}
      {displayedActiveCampaigns.length === 1 ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <ActiveCampaignWidget
            campaign={displayedActiveCampaigns[0]!}
            onRevert={handleEmergencyRevertCampaign}
            isReverting={isRevertingCampaign}
            onViewDeliverable={() => {
              void handleOpenCampaignDeliverable(displayedActiveCampaigns[0]!.id, true);
            }}
          />
        </div>
      ) : displayedActiveCampaigns.length > 1 ? (
        <div className="ccActiveCampaignsSection">
          <div className="ccActiveCampaignsNavRow">
            <div className="ccActiveCampaignsNavLeft">
              <Flame size={16} color="#f43f5e" />
              <span>Chiến dịch đang kích hoạt</span>
              <span className="ccActiveCampaignsCountBadge">
                {displayedActiveCampaigns.length} chiến dịch song song
              </span>
            </div>
            <div className="ccActiveCampaignsNavRight">
              <div className="ccActiveCampaignsNavPills">
                {displayedActiveCampaigns.map((camp, idx) => (
                  <button
                    key={camp.id}
                    type="button"
                    onClick={() => {
                      setActiveCampaignScrollIndex(idx);
                      const container = activeCampaignsScrollRef.current;
                      if (container) {
                        const children = Array.from(container.children) as HTMLElement[];
                        if (children[idx]) {
                          children[idx].scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }
                      }
                    }}
                    className={`ccActiveCampaignsNavPill ${activeCampaignScrollIndex === idx ? "active" : ""}`}
                    title={camp.name}
                  >
                    #{idx + 1}: {camp.name.length > 25 ? `${camp.name.slice(0, 25)}...` : camp.name}
                  </button>
                ))}
              </div>
              <div className="ccActiveCampaignsNavArrowGroup">
                <button
                  type="button"
                  className="ccActiveCampaignsNavArrowBtn"
                  disabled={activeCampaignScrollIndex <= 0}
                  onClick={() => {
                    const nextIdx = Math.max(0, activeCampaignScrollIndex - 1);
                    setActiveCampaignScrollIndex(nextIdx);
                    const container = activeCampaignsScrollRef.current;
                    if (container) {
                      const children = Array.from(container.children) as HTMLElement[];
                      if (children[nextIdx]) {
                        children[nextIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }
                    }
                  }}
                  title="Chiến dịch trước (Cuộn lên)"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="ccActiveCampaignsNavArrowBtn"
                  disabled={activeCampaignScrollIndex >= displayedActiveCampaigns.length - 1}
                  onClick={() => {
                    const nextIdx = Math.min(displayedActiveCampaigns.length - 1, activeCampaignScrollIndex + 1);
                    setActiveCampaignScrollIndex(nextIdx);
                    const container = activeCampaignsScrollRef.current;
                    if (container) {
                      const children = Array.from(container.children) as HTMLElement[];
                      if (children[nextIdx]) {
                        children[nextIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }
                    }
                  }}
                  title="Chiến dịch tiếp theo (Cuộn xuống)"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          </div>

          <div
            ref={activeCampaignsScrollRef}
            className="ccActiveCampaignsScrollBox"
            onScroll={() => {
              const container = activeCampaignsScrollRef.current;
              if (!container) return;
              const children = Array.from(container.children) as HTMLElement[];
              const containerTop = container.scrollTop;
              let closestIdx = 0;
              let minDiff = Infinity;
              children.forEach((child, idx) => {
                const diff = Math.abs(child.offsetTop - container.offsetTop - containerTop);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIdx = idx;
                }
              });
              if (closestIdx !== activeCampaignScrollIndex && closestIdx >= 0 && closestIdx < displayedActiveCampaigns.length) {
                setActiveCampaignScrollIndex(closestIdx);
              }
            }}
          >
            {displayedActiveCampaigns.map((camp) => (
              <div key={camp.id} id={`active-camp-${camp.id}`} className="ccActiveCampaignItem">
                <ActiveCampaignWidget
                  campaign={camp}
                  onRevert={handleEmergencyRevertCampaign}
                  isReverting={isRevertingCampaign}
                  onViewDeliverable={() => {
                    void handleOpenCampaignDeliverable(camp.id, true);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* TIER 2: 2x2 Workforce Grid (Left 70%) & Live Activity + Approvals (Right 30%) */}
      <div className="ccMainContentGrid">
        <div ref={workforceColumnRef} style={{ minWidth: 0, overflow: "hidden" }}>
          <WorkforceGrid
            departments={filteredDepartmentCards}
            onViewDagGraph={() => {
              if (activeTaskId) {
                navigate(`/agentic/tasks/${activeTaskId}`);
              } else if (activeCampaignDetail?.campaign.id) {
                navigate(`/marketing/campaigns/${activeCampaignDetail.campaign.id}`);
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

        <div className="ccSidebarSection">
          <div ref={liveFeedContainerRef}>
            <LiveActivityFeed
              events={filteredLiveEvents}
              activeDepartmentFilter={liveFeedFilter}
              onFilterChange={setLiveFeedFilter}
            />
          </div>
          <PendingApprovalsPanel
            approvals={redesignedApprovals}
            onViewAll={() => navigate("/agentic/approvals")}
            maxHeight={approvalsScrollMaxHeight}
            focusedApprovalId={focusedApprovalId ?? undefined}
          />
        </div>
      </div>

      {/* TIER 3: Results & Performance Dashboard */}
      <ResultsMetricsPanel
        totalCompleted={completedCount}
        onTimePercent={onTimePercent}
        delayedPercent={delayedPercent}
        cancelledPercent={cancelledPercent}
        departmentEfficiencies={departmentEfficiencies}
        activeTasksCount={runningCount}
        completedThisWeekCount={completedCount}
        completedTrendPercent={completedCount > 0 ? 27 : 0}
        avgDurationHours={avgDurationHours > 0 ? avgDurationHours : 3.2}
        avgDurationDisplay={avgDurationDisplay || "3.2h"}
        durationTrendPercent={-41}
        approvalRatePercent={approvalRatePercent > 0 ? approvalRatePercent : 96}
        approvalRateTrendPercent={12}
        recentDeliverables={redesignedRecentDeliverables}
        onViewAllDeliverables={() => navigate("/agentic/tasks-table")}
      />

      {/* Production Modals */}
      {campaignProposalModalOpen && (viewingCampaignProposal || campaignProposal) && (
        <CampaignProposalModal
          proposal={(viewingCampaignProposal || campaignProposal)!}
          onClose={() => {
            setCampaignProposalModalOpen(false);
            setViewingCampaignProposal(null);
          }}
          onApprove={handleApproveCampaign}
          isActivating={isActivatingCampaign}
          apiBaseUrl={apiBaseUrl}
          readOnly={isCampaignModalReadOnly}
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

      <DepartmentDiagnosticsModal
        isOpen={diagnosticsState.isOpen}
        department={diagnosticsState.department}
        departmentName={diagnosticsState.departmentName}
        errorMessage={diagnosticsState.errorMessage}
        timestamp={diagnosticsState.timestamp}
        onClose={() => setDiagnosticsState((prev) => ({ ...prev, isOpen: false }))}
        onRetry={() => {
          if (diagnosticsState.department === "operations") {
            void handleDepartmentDirectTask("operations", "Rà soát lại tồn kho an toàn và lập dự toán");
          } else if (diagnosticsState.department === "marketing") {
            void handleCheckSocialTokens();
          } else {
            onTaskCreated?.();
          }
        }}
        onOpenAuditLogs={() => navigate("/agentic/audit")}
        onSpecialAction={diagnosticsState.onSpecialAction}
        specialActionLabel={diagnosticsState.specialActionLabel}
      />

      {/* High-visibility Floating Completion Toast */}
      {completionToast && (
        <aside className="ccCompletionToastContainer" aria-label="Thông báo hoàn tất tác vụ">
          <div className="ccCompletionToastCard">
            <div className="ccCompletionToastHeader">
              <div className="ccCompletionToastMeta">
                <div className="ccCompletionToastIconWrap">
                  <CheckCircle2 size={16} />
                </div>
                <span className={`ccCompletionToastDeptTag ${completionToast.department}`}>
                  {completionToast.departmentName}
                </span>
                <span className="ccCompletionToastStatusBadge">
                  <Sparkles size={11} /> Hoàn tất 100%
                </span>
              </div>
              <button
                type="button"
                className="ccCompletionToastCloseBtn"
                onClick={() => setCompletionToast(null)}
                aria-label="Đóng thông báo"
              >
                <X size={16} />
              </button>
            </div>

            <div className="ccCompletionToastBody">
              <div className="ccCompletionToastTitle" title={completionToast.title}>
                {completionToast.title}
              </div>
              <div className="ccCompletionToastGoal" title={completionToast.goal}>
                Chỉ đạo: &ldquo;{completionToast.goal}&rdquo;
              </div>
            </div>

            <div className="ccCompletionToastActions">
              {completionToast.department === "marketing" ? (
                <>
                  <button
                    type="button"
                    className="ccCompletionToastBtnPrimary"
                    onClick={() => {
                      setMarketingCampaignModalOpen(true);
                      setCompletionToast(null);
                    }}
                  >
                    <Sparkles size={14} /> Xem bài & poster ngay
                  </button>
                  <button
                    type="button"
                    className="ccCompletionToastBtnSecondary"
                    onClick={() => downloadDeliverableDocx(completionToast.deliverable)}
                  >
                    <Download size={14} /> Tải Word (.docx)
                  </button>
                </>
              ) : completionToast.department === "operations" && operationsProposal ? (
                <>
                  <button
                    type="button"
                    className="ccCompletionToastBtnPrimary"
                    onClick={() => {
                      setIsOperationsModalOpen(true);
                      setCompletionToast(null);
                    }}
                  >
                    <FileText size={14} /> Xem Đề xuất nhập kho
                  </button>
                  <button
                    type="button"
                    className="ccCompletionToastBtnSecondary"
                    onClick={() => void handleDownloadOperationsDocx()}
                  >
                    <Download size={14} /> Tải Word (.docx)
                  </button>
                </>
              ) : completionToast.department === "merchandising" && campaignProposal ? (
                <>
                  <button
                    type="button"
                    className="ccCompletionToastBtnPrimary"
                    onClick={() => {
                      setCampaignProposalModalOpen(true);
                      setCompletionToast(null);
                    }}
                  >
                    <Sparkles size={14} /> Xem Đề xuất Flash Sale
                  </button>
                  <button
                    type="button"
                    className="ccCompletionToastBtnSecondary"
                    onClick={() => downloadDeliverableDocx(completionToast.deliverable)}
                  >
                    <Download size={14} /> Tải Word (.docx)
                  </button>
                </>
              ) : completionToast.department === "support" && supportCampaignProposal ? (
                <>
                  <button
                    type="button"
                    className="ccCompletionToastBtnPrimary"
                    onClick={() => {
                      setIsSupportEmailApprovalModalOpen(false);
                      setIsSupportCampaignModalOpen(true);
                      setCompletionToast(null);
                    }}
                  >
                    <Mail size={14} /> Xem chiến dịch email
                  </button>
                  <button
                    type="button"
                    className="ccCompletionToastBtnSecondary"
                    onClick={() => void handleDownloadSupportCampaignDocx()}
                  >
                    <Download size={14} /> Tải Word (.docx)
                  </button>
                </>
              ) : completionToast.department === "support" && supportProposal ? (
                <>
                  <button
                    type="button"
                    className="ccCompletionToastBtnPrimary"
                    onClick={() => {
                      setIsSupportCampaignModalOpen(false);
                      setIsSupportEmailApprovalModalOpen(true);
                      setCompletionToast(null);
                    }}
                  >
                    <Mail size={14} /> Xem nội dung email
                  </button>
                  <button
                    type="button"
                    className="ccCompletionToastBtnSecondary"
                    onClick={() => void handleDownloadSupportDocx()}
                  >
                    <Download size={14} /> Tải Word (.docx)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ccCompletionToastBtnPrimary"
                    onClick={() => {
                      setSelectedStrategicDeliverable(completionToast.deliverable);
                      setIsStrategicModalOpen(true);
                    }}
                  >
                    <FileText size={14} /> Xem Báo cáo ngay
                  </button>
                  <button
                    type="button"
                    className="ccCompletionToastBtnSecondary"
                    onClick={() => downloadDeliverableDocx(completionToast.deliverable)}
                  >
                    <Download size={14} /> Tải Word (.docx)
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      )}

      {marketingCampaignModalOpen && (previewCampaignDetail || activeCampaignDetail || (campaignsList.length > 0 && buildFallbackMarketingDetail(campaignsList[0]))) && (
        <MarketingCampaignModal
          isOpen={marketingCampaignModalOpen}
          onClose={() => {
            setMarketingCampaignModalOpen(false);
            setShowRevisionModal(false);
            setPreviewCampaignDetail(null);
          }}
          detail={previewCampaignDetail || activeCampaignDetail || buildFallbackMarketingDetail(campaignsList[0])}
          api={marketingApi}
          onApprove={() => {
            const id = previewCampaignDetail?.campaign.id || activeCampaignDetail?.campaign.id || campaignsList[0]?.id;
            if (id) void handleApproveMarketing(id);
          }}
          onRequestRevision={(feedback) => {
            const id = previewCampaignDetail?.campaign.id || activeCampaignDetail?.campaign.id || campaignsList[0]?.id;
            if (id) void handleRevisionMarketing(feedback, id);
          }}
          onRetryPublication={() => {
            const id = previewCampaignDetail?.campaign.id || activeCampaignDetail?.campaign.id || campaignsList[0]?.id;
            if (id) void handleRetryPublication(id);
          }}
          onCancelCampaign={() => {
            const id = previewCampaignDetail?.campaign.id || activeCampaignDetail?.campaign.id || campaignsList[0]?.id;
            if (id) void handleCancelMarketingCampaign(id);
          }}
          isActionLoading={marketingActionLoading}
          initialShowRevisionForm={showRevisionModal}
        />
      )}

      <SupportEmailApprovalModal
        isOpen={isSupportEmailApprovalModalOpen}
        proposal={supportProposal}
        isSubmitting={supportActionLoading}
        onClose={() => setIsSupportEmailApprovalModalOpen(false)}
        onApproveSelected={(ticketIds) => handleApplySupport(ticketIds)}
        onApproveAll={() => handleApplySupport()}
      />

      <SupportEmailCampaignApprovalModal
        isOpen={isSupportCampaignModalOpen}
        proposal={supportCampaignProposal}
        isSubmitting={isSupportCampaignSubmitting}
        onClose={() => setIsSupportCampaignModalOpen(false)}
        onApprove={(selectedIds) => void handleApplySupportCampaign(selectedIds)}
        onReject={async () => {
          if (!supportCampaignProposal || !supportApi?.cancelEmailCampaignProposal) return;
          try {
            await supportApi.cancelEmailCampaignProposal(supportCampaignProposal.id);
            setSupportCampaignProposal(null);
            setCompletedStrategicDeliverable(null);
            setStrategicDeliverableApproved(false);
            setCeoPlan(null);
            setActiveWorkflowKind("orchestration");
            setIsSupportCampaignModalOpen(false);
            await persistCommandActivity({
              department: "support",
              decision: "canceled",
              resourceType: "support_proposal",
              resourceId: supportCampaignProposal.id,
              summary: `Đã từ chối chiến dịch email: ${supportCampaignProposal.title}`,
            });
            setSuccessMessage("Đã từ chối chiến dịch email CSKH.");
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Không thể từ chối chiến dịch email.");
          }
        }}
        onDownloadDocx={() => void handleDownloadSupportCampaignDocx()}
      />

      <StrategicDeliverableModal
        isOpen={isStrategicModalOpen}
        deliverable={displayedStrategicDeliverable}
        onClose={() => setIsStrategicModalOpen(false)}
        onNavigateToApproval={
          displayedApprovalId
            ? () => setFocusedApprovalId(displayedApprovalId)
            : undefined
        }
        onNavigateToTask={(taskId) => navigate(`/agentic/tasks/${taskId}`)}
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
