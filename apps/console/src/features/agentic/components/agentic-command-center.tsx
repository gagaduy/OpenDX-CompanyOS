// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from "react";
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
} from "lucide-react";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { AgenticTaskOverview, AgenticTaskPage, AgenticTaskOperations } from "../types/agentic.types";
import type { MarketingApi } from "../../marketing/api/marketing-api";
import type { MarketingCampaignDetail, MarketingCampaign } from "../../marketing/types";
import type { CatalogApi, MerchandisingProposal } from "../../catalog/api/catalog-api";
import type { InventoryApi } from "../../inventory/api/inventory-api";
import type { SupportOperationsApi } from "../../support/api/support-api";
import type { AiSupportProposalView } from "../../support/types/support.types";
import { useAuth } from "../../authentication/hooks/auth-context";
import { ExecutiveReport } from "./executive-report";
import "../styles/agentic-command-center.css";

interface AgenticCommandCenterProps {
  readonly api: AgenticOperationsApi;
  readonly marketingApi?: MarketingApi;
  readonly catalogApi?: CatalogApi;
  readonly inventoryApi?: InventoryApi;
  readonly supportApi?: SupportOperationsApi;
  readonly overview?: AgenticTaskOverview;
  readonly tasks?: AgenticTaskPage;
  readonly onTaskCreated?: () => void;
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
        el.scrollIntoView({ behavior: "smooth", block: "center" });
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

  // Merchandising / Catalog & Pricing State
  const [merchandisingProposal, setMerchandisingProposal] = useState<MerchandisingProposal | null>(null);
  const [merchandisingLoading, setMerchandisingLoading] = useState(false);

  // Operations / Inventory Restock State
  const [operationsProposal, setOperationsProposal] = useState<any | null>(null);
  const [operationsActionLoading, setOperationsActionLoading] = useState(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);

  // Customer Support & CRM State
  const [supportProposal, setSupportProposal] = useState<AiSupportProposalView | null>(null);
  const [supportActionLoading, setSupportActionLoading] = useState(false);
  const [isDownloadingSupportDocx, setIsDownloadingSupportDocx] = useState(false);

  // Stepped Visual Progression & CEO Planning
  const [ceoPlan, setCeoPlan] = useState<{
    goal: string;
    targetDept: string;
    steps: { role: string; task: string; status: "pending" | "running" | "done" }[];
  } | null>(null);
  const [marketingActiveAgent, setMarketingActiveAgent] = useState<string | null>(null);
  const [marketingAgentMessage, setMarketingAgentMessage] = useState<string | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [visualBlobUrl, setVisualBlobUrl] = useState<string | null>(null);

  // Load initial marketing campaigns list for History without forcing auto-open on clean mount
  useEffect(() => {
    if (!marketingApi) return;
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

    // 1. Explicit Department Priority Check: Marketing & Media
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
      "chiến dịch",
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

    // 2. Explicit Department Priority Check: Operations & Inventory
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

    // 3. Merchandising / Catalog & Pricing keywords
    const merchandisingKeywords = [
      "phòng thương mại",
      "phòng catalog",
      "định giá",
      "flash sale",
      "giảm giá",
      "khuyến mãi",
      "tối ưu sản phẩm",
      "mô tả sản phẩm",
      "chuẩn seo",
      "tiêu đề sản phẩm",
      "danh mục",
      "pricing",
      "catalog",
      "merchandising",
    ];
    if (merchandisingKeywords.some((kw) => lower.includes(kw))) {
      return "merchandising";
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

      if (intent === "support" && supportApi) {
        scrollToDepartment("dept-column-support");
        // Route to Customer Support & CRM Department
        setActiveWorkflowKind("support");

        const cleanName =
          goalText.length > 50 ? `${goalText.slice(0, 48)}...` : goalText.replace(/^(hãy|yêu cầu|triển khai|rà soát|kiểm tra|chăm sóc)\s*/i, "");

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

        // Stage 2: Chuyên viên CRM & OpenRouter Gemini
        setMarketingActiveAgent("crm_specialist");
        setMarketingAgentMessage("🎯 Chuyên viên CRM đang phân tích OpenRouter (Gemini 2.5 Flash) để phân khúc VIP, Churn Risk & soạn Báo cáo Word...");

        const proposal = await supportApi.generateSupportProposal(goalText);
        setSupportProposal(proposal);

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
          goalText.length > 50 ? `${goalText.slice(0, 48)}...` : goalText.replace(/^(hãy|yêu cầu|triển khai|rà soát|kiểm tra|nhập thêm)\s*/i, "");

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

        // Stage 2: Điều phối Đơn hàng & OpenRouter Gemini
        setMarketingActiveAgent("order_coordinator");
        setMarketingAgentMessage("📦 Điều phối Đơn hàng đang phân tích OpenRouter (Gemini 2.5 Flash), tính toán định mức an toàn & lập Báo cáo Word...");

        const proposal = await inventoryApi.generateOperationsProposal(goalText);
        setOperationsProposal(proposal);

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
          goalText.length > 50 ? `${goalText.slice(0, 48)}...` : goalText.replace(/^(hãy|yêu cầu|triển khai|tối ưu|giảm giá)\s*/i, "");

        setCeoPlan({
          goal: goalText,
          targetDept: "Phòng Catalog & Định giá",
          steps: [
            {
              role: "Cây bút Sản phẩm (Catalog Copywriter)",
              task: `Tối ưu tên sản phẩm chuẩn SEO, viết lại mô tả tính năng nổi bật & nhãn ưu đãi cho: "${cleanName}"`,
              status: "running",
            },
            {
              role: "Chuyên gia Định giá (Pricing Strategist)",
              task: `Phân tích biên lợi nhuận, tính toán mức giảm giá Flash Sale và dự báo lượng bán`,
              status: "pending",
            },
            {
              role: "Chủ tịch / Ban Giám đốc",
              task: `Phê duyệt bảng đề xuất & cập nhật trực tiếp giá mới lên Cửa hàng Storefront`,
              status: "pending",
            },
          ],
        });

        // Stage 1: AI CEO Intake & Dispatch
        setMarketingActiveAgent("catalog_copywriter");
        setMarketingAgentMessage("👑 AI CEO đang phân tích yêu cầu, phân bổ Cây bút Sản phẩm & Chuyên gia Định giá...");
        await new Promise((r) => setTimeout(r, 600));

        // Stage 2: Digital Employees Execution via OpenRouter Gemini 2.5 Flash
        setMarketingActiveAgent("pricing_strategist");
        setMarketingAgentMessage("✍️ Đang gọi OpenRouter (Gemini 2.5 Flash) để tối ưu mô tả SEO và tính toán mức giá Flash Sale tối ưu...");

        const proposal = await catalogApi.generateMerchandisingProposal({ prompt: goalText });
        setMerchandisingProposal(proposal);

        // Transition steps: 1 & 2 done, 3 waiting approval
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
        setSuccessMessage("AI CEO đã hoàn tất đề xuất tối ưu sản phẩm & giá Flash Sale! Sẵn sàng để bạn duyệt áp dụng lên Storefront.");
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
          goalText.length > 50 ? `${goalText.slice(0, 48)}...` : goalText.replace(/^(hãy|yêu cầu|triển khai|lên bài|đăng bài)\s*/i, "");

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
    }
  };

  // Direct Department-level Task Delegation (1 input per department)
  const handleDepartmentDirectTask = async (
    departmentType: "marketing" | "merchandising" | "operations" | "support",
    directPrompt: string,
  ) => {
    if (!directPrompt.trim()) return;

    if (departmentType === "marketing") {
      await handleSendStrategicTask(
        `[Phòng Tiếp thị & Sáng tạo] ${directPrompt}`,
        `Giao việc cho Phòng Tiếp thị: ${directPrompt}`,
      );
    } else if (departmentType === "merchandising") {
      await handleSendStrategicTask(
        `[Phòng Danh mục & Định giá] ${directPrompt}`,
        `Giao việc cho Phòng Danh mục & Định giá: ${directPrompt}`,
      );
    } else if (departmentType === "support") {
      await handleSendStrategicTask(
        `[Phòng CSKH & Trải nghiệm Khách hàng] ${directPrompt}`,
        `Giao việc cho Phòng CSKH: ${directPrompt}`,
      );
    } else {
      await handleSendStrategicTask(
        `[Phòng Vận hành & Kho] ${directPrompt}`,
        `Giao việc cho phòng ban: ${directPrompt}`,
      );
    }
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

      const result = await catalogApi.applyMerchandisingProposal({
        proposalId: merchandisingProposal.id,
      });

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

  const handleApplyOperations = async () => {
    if (!operationsProposal?.id || !inventoryApi || operationsActionLoading) return;
    try {
      setOperationsActionLoading(true);
      setErrorMessage(null);
      await inventoryApi.applyOperationsProposal(
        operationsProposal.id,
        operationsProposal.items.map((i: any) => ({
          variantId: i.variantId,
          restockQuantity: i.recommendedRestockQuantity,
        })),
      );
      setOperationsProposal((prev: any) => (prev ? { ...prev, status: "applied" } : null));

      // Complete all steps in CEO Plan
      setCeoPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: "done" })),
            }
          : null,
      );

      setSuccessMessage(`✅ Đã phê duyệt và nhập kho thành công +${operationsProposal.totalRestockUnits} đơn vị hàng vào cơ sở dữ liệu PostgreSQL!`);
    } catch (err) {
      console.error("Failed to apply operations proposal:", err);
      setErrorMessage(err instanceof Error ? err.message : "Không thể nhập kho vào hệ thống.");
    } finally {
      setOperationsActionLoading(false);
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
        {activeWorkflowKind === "merchandising" ? (
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
                        : activeCampaignDetail.targets && activeCampaignDetail.targets.length > 1
                          ? "Phê duyệt & Đăng lên Facebook & Instagram"
                          : activeCampaignDetail.targets?.[0]?.platform === "instagram"
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
                      : activeCampaignDetail.targets?.some((t) => t.platform === "facebook" && t.status !== "verified") &&
                        activeCampaignDetail.targets?.some((t) => t.platform === "instagram" && t.status !== "verified")
                        ? "Thử đăng lại Facebook & Instagram"
                        : activeCampaignDetail.targets?.some((t) => t.platform === "facebook" && t.status !== "verified")
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
            <div style={{ marginTop: "1rem", padding: "1rem", background: "#161c28", borderRadius: 8, border: "1px solid rgba(245, 158, 11, 0.3)" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#fbbf24", marginBottom: "0.5rem" }}>
                Ghi chú yêu cầu chỉnh sửa cho 3 nhân sự số Marketing:
              </label>
              <textarea
                style={{ width: "100%", background: "#10141d", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 6, padding: "0.6rem 0.8rem", color: "#f8fafc", fontSize: "0.85rem", minHeight: 60 }}
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
        <div className="ccMarketingLiveCard" style={{ borderColor: "rgba(56, 189, 248, 0.4)", background: "rgba(14, 25, 45, 0.7)" }}>
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

          {/* Strategy Rationale & Sales Projection Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", padding: "0.75rem 1rem", borderRadius: 8 }}>
              <strong style={{ color: "#fbbf24", fontSize: "0.82rem", display: "block", marginBottom: "0.2rem" }}>
                💡 Lý do chiến lược định giá:
              </strong>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.45 }}>
                {merchandisingProposal.pricingRationale}
              </p>
            </div>
            <div style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)", padding: "0.75rem 1rem", borderRadius: 8 }}>
              <strong style={{ color: "#38bdf8", fontSize: "0.82rem", display: "block", marginBottom: "0.2rem" }}>
                📈 Dự báo lượng bán:
              </strong>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.45 }}>
                {merchandisingProposal.salesProjection}
              </p>
            </div>
          </div>

          {/* Products List (Single or Multi-product) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {(merchandisingProposal.items || []).map((item, idx) => (
              <div
                key={item.targetProductId || idx}
                style={{
                  background: "#101522",
                  padding: "1rem 1.15rem",
                  borderRadius: 12,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr",
                  gap: "1.25rem",
                  alignItems: "start",
                }}
              >
                {/* Left: Product SEO Title & Description */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Sản phẩm #{idx + 1} ({item.categoryName})
                    </span>
                    <span style={{ background: "linear-gradient(90deg, #f59e0b, #ea580c)", color: "#ffffff", padding: "0.15rem 0.5rem", borderRadius: 4, fontSize: "0.72rem", fontWeight: 700 }}>
                      {item.badge}
                    </span>
                  </div>
                  <h4 style={{ margin: "0 0 0.4rem 0", color: "#ffffff", fontSize: "1rem", fontWeight: 700 }}>
                    {item.optimizedTitle}
                  </h4>
                  <div style={{ background: "#0b0f17", padding: "0.65rem 0.8rem", borderRadius: 6, fontSize: "0.82rem", color: "#cbd5e1", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                    {item.optimizedDescription}
                  </div>
                </div>

                {/* Right: Pricing comparison */}
                <div style={{ background: "#0b0f17", padding: "0.85rem 1rem", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.05)", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.4rem" }}>
                      Định giá Flash Sale
                    </span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.4rem" }}>
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>Giá gốc:</span>
                        <del style={{ fontSize: "0.95rem", color: "#94a3b8", fontWeight: 600 }}>
                          {item.originalPriceVnd.toLocaleString("vi-VN")} đ
                        </del>
                      </div>
                      <ArrowRight size={15} color="#64748b" />
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "#34d399", display: "block", fontWeight: 600 }}>Giá mới:</span>
                        <span style={{ fontSize: "1.25rem", color: "#10b981", fontWeight: 800 }}>
                          {item.proposedPriceVnd.toLocaleString("vi-VN")} đ
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "0.25rem 0.6rem", borderRadius: 5, color: "#34d399", fontSize: "0.78rem", fontWeight: 700, marginTop: "0.4rem" }}>
                    <span>Giảm -{item.discountPercent}%</span>
                    <span>•</span>
                    <span>Tiết kiệm {item.savingAmountVnd.toLocaleString("vi-VN")} đ</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
            {merchandisingProposal.status === "pending_approval" && (
              <button
                type="button"
                className="ccMarketingActionBtn approve"
                disabled={merchandisingLoading}
                onClick={handleApplyMerchandisingProposal}
                style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}
              >
                {merchandisingLoading ? <Loader2 size={16} className="ccSpin" /> : <CheckCircle2 size={16} />}
                <span>
                  {merchandisingProposal.items && merchandisingProposal.items.length > 1
                    ? `Duyệt & Áp dụng toàn bộ (${merchandisingProposal.items.length} sản phẩm) lên Storefront`
                    : "Duyệt & Áp dụng ngay lên Storefront"}
                </span>
              </button>
            )}
            {merchandisingProposal.status === "applied" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#10b981", fontWeight: 700, fontSize: "0.95rem" }}>
                <CheckCircle2 size={20} color="#10b981" />
                <span>
                  {merchandisingProposal.items && merchandisingProposal.items.length > 1
                    ? `Đã cập nhật giá mới & mô tả cho cả ${merchandisingProposal.items.length} sản phẩm trực tiếp lên Storefront!`
                    : "Đã cập nhật giá mới & mô tả trực tiếp lên Cửa hàng Storefront!"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4c. In-Place Active Operations & Inventory Restock Proposal Card */}
      {operationsProposal && (
        <div className="ccMarketingLiveCard" style={{ borderColor: "rgba(245, 158, 11, 0.4)", background: "rgba(30, 24, 14, 0.8)" }}>
          <div className="ccMarketingLiveHeader">
            <div className="ccMarketingLiveTitle">
              <Boxes size={18} color="#fbbf24" />
              <span>
                {`Đề xuất Kiểm toán Tồn kho & Bổ sung ${operationsProposal.totalRestockUnits} Đơn vị (${operationsProposal.items?.length || 0} SKU)`}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span
                className={`ccMarketingStatusBadge ${
                  operationsProposal.status === "pending_approval"
                    ? "awaiting"
                    : operationsProposal.status === "applied"
                      ? "live"
                      : "draft"
                }`}
              >
                {operationsProposal.status === "pending_approval"
                  ? "⏳ Chờ Phê Duyệt Nhập Kho"
                  : operationsProposal.status === "applied"
                    ? "✅ Đã Cập Nhật Kho Database"
                    : operationsProposal.status}
              </span>
              <button
                type="button"
                className="ccQuickPill"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "#94a3b8" }}
                onClick={() => setOperationsProposal(null)}
                title="Đóng bảng đề xuất"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Health Summary & Risk Assessment Callouts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)", padding: "0.75rem 1rem", borderRadius: 8 }}>
              <strong style={{ color: "#38bdf8", fontSize: "0.82rem", display: "block", marginBottom: "0.2rem" }}>
                📊 Tổng quan sức khỏe kho:
              </strong>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.45 }}>
                {operationsProposal.inventoryHealthSummary}
              </p>
            </div>
            <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", padding: "0.75rem 1rem", borderRadius: 8 }}>
              <strong style={{ color: "#f87171", fontSize: "0.82rem", display: "block", marginBottom: "0.2rem" }}>
                ⚠️ Phân tích rủi ro chuỗi cung ứng:
              </strong>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.45 }}>
                {operationsProposal.riskAssessment}
              </p>
            </div>
          </div>

          {/* Table of Inventory & Restock Items */}
          <div style={{ overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 8, background: "rgba(10, 15, 25, 0.6)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                  <th style={{ padding: "0.6rem 0.75rem" }}>SKU</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Sản phẩm</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Tồn thực tế</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Đang giữ chỗ</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Khả dụng</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Đề xuất nhập</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>Dự toán chi phí</th>
                </tr>
              </thead>
              <tbody>
                {operationsProposal.items?.map((item: any) => (
                  <tr key={item.variantId || item.sku} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "0.6rem 0.75rem", fontFamily: "monospace", color: "#38bdf8" }}>{item.sku}</td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#f8fafc", fontWeight: 500 }}>
                      <div>{item.productName}</div>
                      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{item.actionRationale}</div>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", color: "#e2e8f0" }}>{item.currentOnHand}</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", color: "#fbbf24" }}>{item.currentReserved}</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.15rem 0.45rem",
                          borderRadius: 4,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background:
                            item.stockStatus === "critical_low"
                              ? "rgba(239, 68, 68, 0.2)"
                              : item.stockStatus === "slow_moving"
                                ? "rgba(245, 158, 11, 0.2)"
                                : "rgba(16, 185, 129, 0.2)",
                          color:
                            item.stockStatus === "critical_low"
                              ? "#f87171"
                              : item.stockStatus === "slow_moving"
                                ? "#fbbf24"
                                : "#34d399",
                        }}
                      >
                        {item.availableQuantity}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      {item.recommendedRestockQuantity > 0 ? (
                        <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                          +{item.recommendedRestockQuantity} đơn vị
                        </span>
                      ) : (
                        <span style={{ color: "#64748b" }}>Đã đủ an toàn</span>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#34d399", fontWeight: 600 }}>
                      {item.estimatedTotalCostVnd > 0 ? `${item.estimatedTotalCostVnd.toLocaleString("vi-VN")} đ` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(255, 255, 255, 0.03)", fontWeight: 700, borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <td colSpan={5} style={{ padding: "0.6rem 0.75rem", color: "#f8fafc" }}>
                    Tổng cộng {operationsProposal.items?.length || 0} SKU
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#38bdf8" }}>
                    +{operationsProposal.totalRestockUnits} đơn vị
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#34d399" }}>
                    {operationsProposal.totalEstimatedBudgetVnd?.toLocaleString("vi-VN")} đ
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Action Row */}
          <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="ccMarketingActionBtn livePost"
                style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.4)", display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1.2rem" }}
                disabled={isDownloadingDocx}
                onClick={handleDownloadOperationsDocx}
              >
                <FileText size={15} />
                <span>{isDownloadingDocx ? "Đang tạo file..." : "📥 Tải Báo Cáo Word (.docx)"}</span>
              </button>
            </div>

            {operationsProposal.status === "pending_approval" && (
              <button
                type="button"
                className="ccMarketingActionBtn approve"
                style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}
                disabled={operationsActionLoading}
                onClick={handleApplyOperations}
              >
                {operationsActionLoading ? <Loader2 size={16} className="ccSpin" /> : <CheckCircle2 size={16} />}
                <span>
                  {operationsActionLoading
                    ? "Đang nhập kho..."
                    : `Phê duyệt & Nhập kho +${operationsProposal.totalRestockUnits} đơn vị`}
                </span>
              </button>
            )}
            {operationsProposal.status === "applied" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#10b981", fontWeight: 700, fontSize: "0.95rem" }}>
                <CheckCircle2 size={20} color="#10b981" />
                <span>Đã nhập kho thành công và cập nhật số lượng tồn vào PostgreSQL!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4d. Customer Support & CRM Live Proposal Card (Emerald Theme) */}
      {supportProposal && (
        <div className="ccProposalCard" style={{ borderColor: "rgba(16, 185, 129, 0.4)", background: "rgba(6, 78, 59, 0.15)", marginTop: "1.5rem" }}>
          {/* Card Header */}
          <div className="ccProposalHeader">
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div className="ccDeptIconBadge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399" }}>
                <Headphones size={18} />
              </div>
              <div>
                <div style={{ color: "#34d399", fontWeight: 700, fontSize: "1rem" }}>
                  Bảng Đề Xuất Xử Lý Khiếu Nại &amp; Chăm Sóc Khách Hàng (Support &amp; CRM)
                </div>
                <div style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                  Được đồng lập bởi <strong>Quản gia CSKH</strong> (Phân tích CSAT) &amp; <strong>Chuyên viên CRM</strong> (Phân khúc VIP &amp; Churn Risk)
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="ccDeptCountBadge emerald">
                <span className="ccPillDot" style={{ width: 6, height: 6, background: "#10b981" }} />
                <span>{supportProposal.status === "applied" ? "Đã duyệt xử lý" : "Chờ Giám đốc duyệt"}</span>
              </span>
              <button
                type="button"
                className="ccQuickPill"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "#94a3b8" }}
                onClick={() => setSupportProposal(null)}
                title="Đóng bảng đề xuất"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Overall Sentiment & Churn Assessment */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1rem", marginBottom: "1rem" }}>
            <div style={{ padding: "0.75rem 1rem", borderRadius: 8, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#34d399", fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                <HeartHandshake size={15} />
                <span>Tổng quan Tâm lý CSAT</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.45 }}>
                {supportProposal.overallSentimentSummary}
              </p>
            </div>

            <div style={{ padding: "0.75rem 1rem", borderRadius: 8, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#f87171", fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                <AlertTriangle size={15} />
                <span>Đánh giá Nguy cơ Rời bỏ (Churn Risk)</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.45 }}>
                {supportProposal.churnRiskAssessment}
              </p>
            </div>
          </div>

          {/* Table of Support Tickets */}
          <div style={{ overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 8, background: "rgba(10, 15, 25, 0.6)", marginBottom: "1rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Khách hàng</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Sự cố &amp; Phân loại</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Tâm lý</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Rủi ro Churn</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Kịch bản phản hồi 5 sao &amp; Đề xuất đền bù</th>
                </tr>
              </thead>
              <tbody>
                {supportProposal.tickets.map((t) => (
                  <tr key={t.ticketId} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#38bdf8", fontWeight: 600 }}>
                      <div>{t.customerName}</div>
                      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{t.customerEmail}</div>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#f8fafc" }}>
                      <div style={{ fontWeight: 500 }}>{t.subject}</div>
                      <span style={{ fontSize: "0.72rem", padding: "0.1rem 0.35rem", borderRadius: 4, background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}>
                        {t.issueCategory}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.15rem 0.45rem",
                          borderRadius: 4,
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          background:
                            t.sentiment === "angry" || t.sentiment === "frustrated"
                              ? "rgba(239, 68, 68, 0.2)"
                              : "rgba(16, 185, 129, 0.2)",
                          color: t.sentiment === "angry" || t.sentiment === "frustrated" ? "#f87171" : "#34d399",
                        }}
                      >
                        {t.sentiment.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.15rem 0.45rem",
                          borderRadius: 4,
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          background:
                            t.churnRisk === "high"
                              ? "rgba(239, 68, 68, 0.2)"
                              : t.churnRisk === "medium"
                                ? "rgba(245, 158, 11, 0.2)"
                                : "rgba(16, 185, 129, 0.2)",
                          color:
                            t.churnRisk === "high"
                              ? "#f87171"
                              : t.churnRisk === "medium"
                                ? "#fbbf24"
                                : "#34d399",
                        }}
                      >
                        {t.churnRisk.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <div style={{ color: "#cbd5e1", lineHeight: 1.4, marginBottom: "0.25rem" }}>
                        {t.proposedResponse}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
                        <span style={{ color: "#34d399", fontWeight: 600, fontSize: "0.78rem" }}>
                          🎁 Đền bù: {t.suggestedCompensation}
                        </span>
                        {supportProposal.status === "applied" && (
                          <span style={{ padding: "0.1rem 0.4rem", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontSize: "0.72rem", fontWeight: 700 }}>
                            ✉️ Email đã gửi
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table of VIP & Loyal Customers */}
          {supportProposal.vipCustomers && supportProposal.vipCustomers.length > 0 && (
            <div style={{ overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 8, background: "rgba(10, 15, 25, 0.6)" }}>
              <div style={{ padding: "0.5rem 0.75rem", background: "rgba(255, 255, 255, 0.03)", color: "#f8fafc", fontWeight: 700, fontSize: "0.85rem" }}>
                💎 Phân Khúc Khách Hàng VIP &amp; Chiến Lược Giữ Chân
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.02)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "#94a3b8" }}>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Khách hàng</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>Phân khúc</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Tổng chi tiêu</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Chiến lược chăm sóc riêng biệt</th>
                  </tr>
                </thead>
                <tbody>
                  {supportProposal.vipCustomers.map((vip) => (
                    <tr key={vip.customerId} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#f8fafc", fontWeight: 600 }}>{vip.customerName}</td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                        <span style={{ padding: "0.1rem 0.4rem", borderRadius: 4, background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", fontWeight: 700, fontSize: "0.75rem" }}>
                          {vip.segment}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#34d399", fontWeight: 600 }}>
                        {vip.totalSpentVnd.toLocaleString("vi-VN")} đ
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#94a3b8" }}>{vip.engagementRecommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action Row */}
          <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="ccMarketingActionBtn livePost"
                style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", borderColor: "rgba(16, 185, 129, 0.4)", display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1.2rem" }}
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

      {/* 5. Unified Department Workforce Grid (5 Distinct Functional Departments) */}
      <div className="ccDepartmentGrid" style={{ marginTop: "2rem" }}>
        {/* Column 1: Tiếp thị & Sáng tạo (Blue Theme) */}
        <div id="dept-column-marketing" className="ccDepartmentColumn theme-blue">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <div className="ccDeptIconBadge">
                <Megaphone size={16} />
              </div>
              <span>Tiếp thị & Sáng tạo</span>
            </div>
            <span className="ccDeptCountBadge">
              <span className="ccPillDot" style={{ width: 6, height: 6, background: "#38bdf8" }} />
              <span>3 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Cây bút Tiếp thị"
            roleTag="SKILL"
            theme="blue"
            status={
              marketingActiveAgent === "marketing_content" || currentMarketingState === "content_drafting"
                ? "running"
                : activeCampaignDetail
                ? "completed"
                : "idle"
            }
            statusText={
              marketingActiveAgent === "marketing_content"
                ? marketingAgentMessage ?? "Đang soạn thảo bài viết và bộ hashtag..."
                : undefined
            }
          />
          <AgentCard
            name="Thiết kế Đồ họa"
            roleTag="SKILL"
            theme="blue"
            status={
              marketingActiveAgent === "marketing_visual" || currentMarketingState === "visual_creation"
                ? "running"
                : activeCampaignDetail
                ? "completed"
                : "idle"
            }
            statusText={
              marketingActiveAgent === "marketing_visual"
                ? marketingAgentMessage ?? "Đang tạo ảnh poster 1:1 chuẩn Facebook..."
                : undefined
            }
          />
          <AgentCard
            name="Điều phối Xuất bản"
            roleTag="ĐỘI"
            theme="blue"
            status={
              marketingActiveAgent === "marketing_publisher" || currentMarketingState === "campaign_review" || currentMarketingState === "awaiting_human_approval"
                ? "running"
                : activeCampaignDetail?.campaign.state === "completed"
                ? "completed"
                : "idle"
            }
            statusText={
              marketingActiveAgent === "marketing_publisher"
                ? marketingAgentMessage ?? "Đang đóng gói và điều phối đăng bài Fanpage..."
                : undefined
            }
          />

          <DepartmentInput
            placeholder="Giao việc cho Tiếp thị & Sáng tạo..."
            theme="blue"
            disabled={isSubmitting}
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
            <span className="ccDeptCountBadge">
              <span className="ccPillDot" style={{ width: 6, height: 6, background: "#06b6d4" }} />
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Cây bút Sản phẩm"
            roleTag="SKILL"
            theme="blue"
            status={
              marketingActiveAgent === "catalog_copywriter"
                ? "running"
                : marketingActiveAgent === "pricing_strategist" || merchandisingProposal
                ? "completed"
                : "idle"
            }
            statusText={
              marketingActiveAgent === "catalog_copywriter"
                ? marketingAgentMessage ?? "Đang tối ưu tên sản phẩm và mô tả SEO..."
                : undefined
            }
            showProgress={marketingActiveAgent === "catalog_copywriter"}
          />
          <AgentCard
            name="Chuyên gia Định giá"
            roleTag="TRỢ LÝ"
            theme="blue"
            status={
              marketingActiveAgent === "pricing_strategist"
                ? "running"
                : merchandisingProposal
                ? "completed"
                : "idle"
            }
            statusText={
              marketingActiveAgent === "pricing_strategist"
                ? marketingAgentMessage ?? "Đang tính toán giá Flash Sale & biên lợi nhuận..."
                : undefined
            }
            showProgress={marketingActiveAgent === "pricing_strategist"}
          />

          <DepartmentInput
            placeholder="Giao việc cho Danh mục & Định giá..."
            theme="cyan"
            disabled={isSubmitting}
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
            <span className="ccDeptCountBadge">
              <span className="ccPillDot" style={{ width: 6, height: 6, background: "#fbbf24" }} />
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Kỹ sư Tồn kho"
            roleTag="SKILL"
            theme="amber"
            status={
              marketingActiveAgent === "inventory_specialist"
                ? "running"
                : marketingActiveAgent === "order_coordinator" || operationsProposal
                ? "completed"
                : getBranchState("inventory")
            }
            statusText={
              marketingActiveAgent === "inventory_specialist"
                ? marketingAgentMessage ?? "Đang rà soát mức tồn kho thực tế và lượng giữ chỗ..."
                : undefined
            }
            showProgress={marketingActiveAgent === "inventory_specialist"}
          />
          <AgentCard
            name="Điều phối Đơn hàng"
            roleTag="ĐỘI"
            theme="amber"
            status={
              marketingActiveAgent === "order_coordinator"
                ? "running"
                : operationsProposal
                ? "completed"
                : getBranchState("order") === "completed"
                ? "completed"
                : getBranchState("order")
            }
            statusText={
              marketingActiveAgent === "order_coordinator"
                ? marketingAgentMessage ?? "Đang tính toán tốc độ luân chuyển & dự toán ngân sách..."
                : undefined
            }
            showProgress={marketingActiveAgent === "order_coordinator"}
          />

          <DepartmentInput
            placeholder="Giao việc cho Vận hành & Kho..."
            theme="amber"
            disabled={isSubmitting}
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
            <span className="ccDeptCountBadge">
              <span className="ccPillDot" style={{ width: 6, height: 6, background: "#34d399" }} />
              <span>2 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Quản gia CSKH"
            roleTag="TRỢ LÝ"
            theme="emerald"
            status={
              marketingActiveAgent === "support_steward"
                ? "running"
                : marketingActiveAgent === "crm_specialist" || supportProposal
                ? "completed"
                : getBranchState("support") === "completed"
                ? "completed"
                : getBranchState("support")
            }
            statusText={
              marketingActiveAgent === "support_steward"
                ? marketingAgentMessage ?? "Đang rà soát ticket sự cố và đánh giá tâm lý..."
                : undefined
            }
            showProgress={marketingActiveAgent === "support_steward"}
          />
          <AgentCard
            name="Chuyên viên CRM"
            roleTag="SKILL"
            theme="emerald"
            status={
              marketingActiveAgent === "crm_specialist"
                ? "running"
                : supportProposal
                ? "completed"
                : getBranchState("crm") === "completed"
                ? "completed"
                : getBranchState("crm")
            }
            statusText={
              marketingActiveAgent === "crm_specialist"
                ? marketingAgentMessage ?? "Đang phân khúc VIP & dự toán voucher..."
                : undefined
            }
            showProgress={marketingActiveAgent === "crm_specialist"}
          />

          <DepartmentInput
            placeholder="Giao việc cho CSKH & CRM..."
            theme="emerald"
            disabled={isSubmitting}
            onSend={(text) => handleDepartmentDirectTask("support", text)}
          />
        </div>

        {/* Column 5: Tài chính (Purple Theme) */}
        <div id="dept-column-finance" className="ccDepartmentColumn theme-purple">
          <div className="ccDepartmentHeader">
            <div className="ccDepartmentName">
              <div className="ccDeptIconBadge">
                <DollarSign size={16} />
              </div>
              <span>Tài chính</span>
            </div>
            <span className="ccDeptCountBadge">
              <span className="ccPillDot" style={{ width: 6, height: 6, background: "#c084fc" }} />
              <span>1 Nhân sự</span>
            </span>
          </div>

          <AgentCard
            name="Kiểm soát viên Tài chính"
            roleTag="SKILL"
            theme="purple"
            status={getBranchState("finance") === "completed" ? "completed" : getBranchState("finance")}
            statusText={
              getBranchState("finance") === "running"
                ? "Đang đối soát giao dịch và cổng thanh toán..."
                : undefined
            }
          />

          <DepartmentInput
            placeholder="Giao việc cho Tài chính..."
            theme="purple"
            disabled={isSubmitting}
            onSend={(text) => handleDepartmentDirectTask("operations", text)}
          />
        </div>
      </div>

      {/* 6. Live Executive Report Output when Orchestration is available */}
      {executiveReportData && (
        <div style={{ marginTop: "2rem" }}>
          <ExecutiveReport report={executiveReportData} workflowState={currentOrchestrationState} />
        </div>
      )}
    </section>
  );
}

interface DepartmentInputProps {
  readonly placeholder: string;
  readonly theme: "blue" | "cyan" | "amber" | "emerald" | "purple";
  readonly disabled?: boolean;
  readonly onSend: (input: string) => void;
}

function DepartmentInput({ placeholder, theme, disabled, onSend }: DepartmentInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input);
    setInput("");
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
      <button type="submit" className={`ccDeptSendBtn theme-${theme}`} title="Giao việc cho phòng ban" disabled={disabled || !input.trim()}>
        <Send size={14} />
      </button>
    </form>
  );
}

interface AgentCardProps {
  readonly name: string;
  readonly roleTag: "SKILL" | "TRỢ LÝ" | "ĐỘI";
  readonly status: "idle" | "running" | "completed" | "failed";
  readonly statusText?: string;
  readonly showProgress?: boolean;
  readonly theme?: "blue" | "amber" | "emerald" | "purple";
}

function AgentCard({
  name,
  roleTag,
  status,
  statusText,
  showProgress,
  theme = "blue",
}: AgentCardProps) {
  return (
    <div
      className={`ccAgentCard ${status === "running" ? "activeThinking" : ""} ${
        status === "running" ? `activeBorder-${theme}` : ""
      }`}
    >
      <div className="ccAgentCardHeader">
        <span className="ccAgentRoleBadge">{roleTag}</span>
        {status === "running" ? (
          <span className="ccStatusIndicatorIcon" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <span className={`ccStatusIndicatorDot ${theme}`} />
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
        <p className={`ccAgentContentText ${status === "running" ? "activeCalc" : ""}`}>
          {statusText}
        </p>
      )}

      {(showProgress || (status === "running" && theme === "amber")) && (
        <div className="ccProgressBarContainer">
          <div className="ccProgressBarFill" />
        </div>
      )}
    </div>
  );
}
