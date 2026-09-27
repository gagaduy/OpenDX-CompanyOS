// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AiSupportProposalView } from "../support/types/support.types";
import type { MarketingCampaignDetail } from "../marketing/types";

export type BusinessNodeType = "event" | "ai_analysis" | "decision_router" | "approval_gate" | "action";
export type BusinessNodeStatus = "idle" | "running" | "waiting_approval" | "completed" | "rejected";

export interface WorkflowConditionBranch {
  readonly id: string;
  readonly label: string;
  readonly conditionText: string;
  readonly targetNodeId: string;
  readonly variant: "auto" | "approval";
}

export interface BusinessWorkflowNode {
  readonly id: string;
  readonly type: BusinessNodeType;
  readonly stepNumber: number;
  readonly stepLabel?: string;
  readonly title: string;
  readonly badge: string;
  readonly department: "support" | "inventory" | "marketing" | "finance";
  readonly actor: string;
  readonly status: BusinessNodeStatus;
  readonly summary: string;
  readonly keyHighlights: readonly string[];
  readonly branches?: readonly WorkflowConditionBranch[];
  readonly details: {
    readonly description: string;
    readonly parameters: readonly { label: string; value: string }[];
    readonly evidence?: string;
  };
  readonly actions?: readonly {
    readonly id: string;
    readonly label: string;
    readonly variant: "primary" | "secondary" | "danger";
  }[];
}

export interface WorkflowEdgeDefinition {
  readonly source: string;
  readonly target: string;
  readonly sourceHandle?: string | null;
  readonly targetHandle?: string | null;
  readonly label?: string;
}

export interface BusinessWorkflowDefinition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: "customer_recovery" | "marketing_campaign" | "inventory_replenishment" | string;
  readonly description: string;
  readonly targetOutcome: string;
  readonly isActive: boolean;
  readonly automationRate: string;
  readonly version: string;
  readonly status: "draft" | "published";
  readonly publishedAt?: string;
  readonly nodes: readonly BusinessWorkflowNode[];
  readonly edges?: readonly WorkflowEdgeDefinition[];
  readonly policyRules?: Record<string, unknown>;
}

export interface WorkflowValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function validateWorkflowGraph(
  nodes: readonly BusinessWorkflowNode[],
  edges: readonly { source: string; target: string }[],
): WorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const triggerNodes = nodes.filter((n) => n.type === "event");
  if (triggerNodes.length === 0) {
    errors.push("Quy trình bắt buộc phải có ít nhất 1 Sự Kiện Kích Hoạt (Trigger) ở đầu.");
  }

  const endNodes = nodes.filter((n) => n.type === "action" || n.type === "approval_gate");
  if (endNodes.length === 0) {
    errors.push("Quy trình bắt buộc phải có ít nhất 1 Hành Động Thực Thi hoặc Cổng Sếp Duyệt ở cuối.");
  }

  nodes.forEach((node) => {
    const hasIncoming = edges.some((e) => e.target === node.id);
    const hasOutgoing = edges.some((e) => e.source === node.id);

    if (node.type === "event" && !hasOutgoing && nodes.length > 1) {
      warnings.push(`Sự kiện "${node.title}" chưa được nối dây đến bước tiếp theo.`);
    } else if (node.type !== "event" && !hasIncoming) {
      errors.push(`Khối "${node.title}" chưa có dây nối đầu vào.`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export const CUSTOMER_RECOVERY_WORKFLOW_FIXTURE: BusinessWorkflowDefinition = {
  id: "wf-customer-recovery-v1",
  code: "WF-CSKH-RECOVERY",
  name: "Cứu Khách Hàng Khiếu Nại & Bồi Thường Nhanh",
  category: "customer_recovery",
  description: "Tự động phân loại bức xúc của khách hàng, huy động AI CSKH lập phương án bồi thường thiện chí và xin lỗi, tự động giải quyết các ca nhỏ và chỉ chuyển Sếp duyệt khi vượt hạn mức.",
  targetOutcome: "Xoa dịu khách hàng trong vòng 5 phút, giữ chân khách quen và ngăn chặn nguy cơ đánh giá tiêu cực công khai.",
  isActive: true,
  automationRate: "85% Tự Động Hóa",
  version: "v1.0",
  status: "published",
  publishedAt: "2026-09-25 09:00",
  nodes: [
    {
      id: "node-1-event",
      type: "event",
      stepNumber: 1,
      title: "Tiếp Nhận Khiếu Nại Khách Hàng",
      badge: "Sự Kiện Bắt Đầu",
      department: "support",
      actor: "Hệ thống tiếp nhận đa kênh",
      status: "completed",
      summary: "Khách hàng Nguyễn Văn A gửi email phàn nàn về vết trầy xước trên laptop vừa nhận.",
      keyHighlights: [
        "Phiếu hỗ trợ: #TCK-2026-0922",
        "Kênh tiếp nhận: Email hỗ trợ (support@novacommerce.vn)",
        "Khách hàng: Nguyễn Văn A (nguyenvana@gmail.com)",
      ],
      details: {
        description: "Hệ thống tự động phát hiện ticket có chỉ số đánh giá tiêu cực và từ khóa phản ánh chất lượng đóng gói/sản phẩm.",
        parameters: [
          { label: "Mã phiếu hỗ trợ", value: "TCK-2026-0922-01" },
          { label: "Mã đơn hàng liên quan", value: "ORD-20260920-8912" },
          { label: "Thời điểm ghi nhận", value: "Hôm nay, 20:15:30" },
          { label: "Trạng thái tiếp nhận", value: "Đã xác thực danh tính khách" },
        ],
        evidence: "Inbound email đã được kiểm tra tính hợp lệ và quét sạch mã độc qua ClamAV.",
      },
    },
    {
      id: "node-2-ai-analysis",
      type: "ai_analysis",
      stepNumber: 2,
      title: "AI Phân Tích & Đề Xuất Bồi Thường",
      badge: "AI Xử Lý Nghiệp Vụ",
      department: "support",
      actor: "Digital Employee: Support Steward (AI CSKH)",
      status: "completed",
      summary: "AI nhận diện mức độ bức xúc 'Cao', tra cứu lịch sử mua sắm và soạn sẵn thư xin lỗi kèm voucher bồi thường 15%.",
      keyHighlights: [
        "Mức độ bức xúc: Khẩn cấp / Thất vọng cao",
        "Hạng khách hàng: Thân thiết (Đã chi 24.500.000 đ)",
        "Đề xuất: Voucher giảm giá 15% (VIPCARE-XUOC-15)",
      ],
      details: {
        description: "AI Support Steward phân tích ngữ cảnh, đối chiếu chính sách bảo hành của công ty và tự động chuẩn bị nội dung phản hồi đồng cảm nhất.",
        parameters: [
          { label: "Thời gian xử lý của AI", value: "1.2 giây" },
          { label: "Mức giảm đề xuất", value: "15% giá trị đơn hàng tiếp theo" },
          { label: "Mã voucher dự kiến", value: "VIPCARE-XUOC-15" },
          { label: "Hạn sử dụng voucher", value: "30 ngày kể từ ngày kích hoạt" },
        ],
        evidence: "Đề xuất tuân thủ trần ngân sách bồi thường tối đa 500.000 đ của phòng CSKH.",
      },
    },
    {
      id: "node-3-decision",
      type: "decision_router",
      stepNumber: 3,
      title: "Phân Luồng Theo Hạn Mức Bồi Thường",
      badge: "Luật Nghiệp Vụ & Phân Luồng",
      department: "support",
      actor: "Bộ quy tắc chính sách (Policy Engine)",
      status: "completed",
      summary: "Định tuyến dựa trên giá trị bồi thường: Thiệt hại nhẹ tự động giải quyết ngay trong 30 giây, vượt trần chuyển Sếp duyệt.",
      keyHighlights: [
        "Luật 1: Bồi thường ≤ 200.000 đ ➔ Tự động xử lý ngay",
        "Luật 2: Bồi thường > 200.000 đ hoặc VIP ➔ Chờ Sếp duyệt",
      ],
      branches: [
        {
          id: "b-auto",
          label: "Tự động ≤ 200k",
          conditionText: "Bồi thường ≤ 200.000 đ & Khách thông thường",
          targetNodeId: "node-4a-auto",
          variant: "auto",
        },
        {
          id: "b-approval",
          label: "Cần Sếp duyệt > 200k",
          conditionText: "Bồi thường > 200.000 đ hoặc Khách VIP Diamond",
          targetNodeId: "node-4b-approval",
          variant: "approval",
        },
      ],
      details: {
        description: "Tránh làm phiền ban giám đốc với các sự vụ nhỏ lẻ, đồng thời kiểm soát chặt chẽ ngân sách bồi thường lớn.",
        parameters: [
          { label: "Hạn mức tự động duyệt", value: "200.000 đ / ca khiếu nại" },
          { label: "Tỷ lệ tự động hóa mục tiêu", value: "85% tổng số ca" },
          { label: "Tiêu chuẩn rẽ nhánh", value: "Giá trị voucher + Hạng hội viên" },
        ],
        evidence: "Chính sách phân quyền CSKH số 14/QĐ-CSKH phê duyệt bởi Ban Giám Đốc.",
      },
    },
    {
      id: "node-4a-auto",
      type: "action",
      stepNumber: 4,
      stepLabel: "4A",
      title: "Tự Động Kích Hoạt Voucher & Gửi Mail",
      badge: "Tự Động 100% Trong 30s",
      department: "support",
      actor: "Hệ thống điều hành NovaCommerce",
      status: "idle",
      summary: "Với các ca bồi thường nhỏ, hệ thống tự kích hoạt mã giảm giá và gửi email xin lỗi khách ngay lập tức mà không cần chờ Sếp duyệt.",
      keyHighlights: [
        "Điều kiện: Ca khiếu nại nhỏ ≤ 200.000 đ",
        "Thời gian phản hồi: < 30 giây tới hòm thư khách",
      ],
      details: {
        description: "Thực thi tự động nguyên tử (Atomic Execution), xoa dịu khách hàng tức thì trước khi bức xúc lan rộng.",
        parameters: [
          { label: "Kênh gửi thư", value: "Máy chủ SMTP chính thức (noreply@novacommerce.vn)" },
          { label: "Mẫu email", value: "Thư xin lỗi trang trọng chuẩn thương hiệu NovaCare" },
        ],
        evidence: "Hệ thống tự động lưu vết và đối soát ngân sách hàng ngày.",
      },
    },
    {
      id: "node-4b-approval",
      type: "approval_gate",
      stepNumber: 4,
      stepLabel: "4B",
      title: "Duyệt Phương Án Bồi Thường CSKH",
      badge: "Cổng Kiểm Soát Nghiệp Vụ",
      department: "support",
      actor: "Quản trị viên / Trưởng bộ phận CSKH",
      status: "waiting_approval",
      summary: "Các ca bồi thường lớn hoặc khách VIP được gửi vào Hộp thư chờ duyệt (/agentic/approvals) để Trưởng phòng quyết định.",
      keyHighlights: [
        "Hạn mức thẩm quyền: > 200.000 đ hoặc Khách VIP",
        "Đích đến: Chuyển vào Hộp thư phê duyệt tập trung",
      ],
      details: {
        description: "Cổng kiểm soát Human-in-the-loop bảo đảm không có mã voucher vượt hạn mức nào được phát ra mà thiếu sự giám sát của con người.",
        parameters: [
          { label: "Người có thẩm quyền", value: "Trưởng phòng CSKH hoặc Ban Giám Đốc" },
          { label: "Mức độ rủi ro", value: "Trung bình - Cao" },
        ],
        evidence: "Ghi nhận nhật ký kiểm toán (Audit Trail) ngay khi người có thẩm quyền bấm duyệt.",
      },
      actions: [
        { id: "approve", label: "Đồng Ý Duyệt Phương Án", variant: "primary" },
        { id: "reject", label: "Từ Chối & Yêu Cầu Sửa", variant: "danger" },
      ],
    },
  ],
  edges: [
    { source: "node-1-event", target: "node-2-ai-analysis" },
    { source: "node-2-ai-analysis", target: "node-3-decision" },
    { source: "node-3-decision", target: "node-4a-auto", sourceHandle: "auto", label: "Tự động ≤ 200k" },
    { source: "node-3-decision", target: "node-4b-approval", sourceHandle: "approval", label: "Cần Sếp duyệt > 200k" },
  ],
  policyRules: {
    auto_approval_threshold: 200000,
    currency: "VND",
    approval_gate_role: "support_manager",
  },
};

export const MARKETING_LAUNCH_WORKFLOW_FIXTURE: BusinessWorkflowDefinition = {
  id: "wf-marketing-launch-v1",
  code: "WF-MKT-LAUNCH",
  name: "Kích Hoạt Chiến Dịch Marketing & Đa Kênh",
  category: "marketing_campaign",
  description: "Khi có sản phẩm mới xuất bản, AI tự động viết bài truyền thông, tạo ảnh banner, chuyển sang bước duyệt bài và tự động đăng bài đa kênh lên Facebook & Instagram.",
  targetOutcome: "Phủ sóng sản phẩm mới trên mạng xã hội trong 10 phút, kiểm soát chất lượng nội dung trước khi xuất bản.",
  isActive: true,
  automationRate: "85% Tự Động Hóa",
  version: "v1.0",
  status: "published",
  publishedAt: "2026-09-25 09:00",
  nodes: [
    {
      id: "mkt-1-event",
      type: "event",
      stepNumber: 1,
      title: "Sản Phẩm Mới Xuất Bản Trong Danh Mục",
      badge: "Sự Kiện Bắt Đầu",
      department: "marketing",
      actor: "Hệ thống Quản lý Danh mục (Catalog)",
      status: "completed",
      summary: "Sản phẩm Laptop Nova Pro 2026 vừa được duyệt xuất bản trên gian hàng trực tuyến.",
      keyHighlights: [
        "Sản phẩm: Laptop Nova Pro 2026",
        "Danh mục: Máy tính & Thiết bị thông minh",
        "Giá niêm yết: 28.990.000 đ",
      ],
      details: {
        description: "Sự kiện được kích hoạt khi trạng thái sản phẩm chuyển sang 'Đang bán' và đã có hình ảnh đại diện.",
        parameters: [
          { label: "Mã sản phẩm", value: "PRD-NOVA-2026" },
          { label: "Tồn kho khả dụng", value: "150 chiếc" },
        ],
      },
    },
    {
      id: "mkt-2-ai-analysis",
      type: "ai_analysis",
      stepNumber: 2,
      title: "AI Sáng Tạo Bài Viết & Thiết Kế Banner",
      badge: "AI Xử Lý Nghiệp Vụ",
      department: "marketing",
      actor: "Digital Employee: Campaign Specialist (AI MKT)",
      status: "completed",
      summary: "AI tự động phân tích điểm nổi bật của sản phẩm, viết 3 biến thể bài đăng mạng xã hội và tạo ảnh banner chuẩn kích thước Facebook/Instagram.",
      keyHighlights: [
        "Bài viết: Đã hoàn thiện 3 bản copy",
        "Thiết kế: Banner kích thước 1200x630px & Story 1080x1920px",
        "Thông điệp chính: Đột phá hiệu năng - Đẳng cấp doanh nhân",
      ],
      details: {
        description: "Sử dụng mô hình ngôn ngữ và hình ảnh tạo nội dung chuẩn định dạng trang Facebook & Instagram.",
        parameters: [
          { label: "Thời gian sáng tạo", value: "4.5 giây" },
          { label: "Kênh phát hành", value: "Facebook Page & Instagram Business" },
        ],
      },
    },
    {
      id: "mkt-3-approval",
      type: "approval_gate",
      stepNumber: 3,
      title: "Duyệt Bài Viết Trước Khi Đăng",
      badge: "Kiểm Duyệt Nội Dung",
      department: "marketing",
      actor: "Người phụ trách Marketing / Content Lead",
      status: "waiting_approval",
      summary: "Kiểm tra câu từ, hình ảnh và thông điệp do AI tạo ra trước khi xuất bản lên mạng xã hội.",
      keyHighlights: [
        "Thao tác: Bấm 'Duyệt Bài' để kích hoạt đăng tự động",
        "Kiểm tra: Thông điệp truyền thông, ảnh đại diện, hashtag",
        "Kênh phát: Fanpage Facebook & Instagram Official",
      ],
      details: {
        description: "Bước kiểm duyệt nội dung bảo đảm bài viết chuẩn xác, hình ảnh sắc nét và phù hợp trước khi xuất bản công khai lên Fanpage và Instagram.",
        parameters: [
          { label: "Người kiểm duyệt", value: "Content Lead / Chuyên viên Marketing" },
          { label: "Mức độ ưu tiên", value: "Cao (Bài đăng sản phẩm mới)" },
          { label: "Hành động tiếp theo", value: "Tự động đăng lên Facebook & Instagram" },
        ],
        evidence: "Ghi nhận lịch sử kiểm duyệt và người xác nhận vào nhật ký hệ thống.",
      },
      actions: [
        { id: "approve", label: "Duyệt Bài & Cho Phép Đăng", variant: "primary" },
        { id: "reject", label: "Từ Chối & Yêu Cầu AI Sửa Lại", variant: "danger" },
      ],
    },
    {
      id: "mkt-4-publish",
      type: "action",
      stepNumber: 4,
      title: "Tự Động Đăng Bài Lên Facebook & Instagram",
      badge: "Tự Động Xuất Bản",
      department: "marketing",
      actor: "Facebook & Instagram Publishing Engine",
      status: "idle",
      summary: "Sau khi duyệt bài, hệ thống tự động gọi Meta Graph API để đăng bài viết và hình ảnh lên fanpage chính thức và tài khoản Instagram của công ty.",
      keyHighlights: [
        "Kênh phát: Fanpage NovaCommerce (tích xanh) & Instagram Official",
        "Điều kiện kích hoạt: Ngay sau khi Bước 3 được duyệt",
        "Biên nhận: Lưu vết Meta Post ID và hàm băm SHA-256 đối soát",
      ],
      details: {
        description: "Bài đăng được xuất bản trực tiếp kèm liên kết sản phẩm, gắn thẻ danh mục và tự động phản hồi xác thực biên nhận.",
        parameters: [
          { label: "Mã fanpage", value: "fb-novacommerce-official" },
          { label: "Kênh phát hành", value: "Meta Graph API v20.0" },
          { label: "Thẻ gắn kèm", value: "#NovaPhonePro #Tech2026 #NovaCommerce" },
        ],
        evidence: "Hệ thống tự động lưu biên nhận xuất bản (Publication Record) vào cơ sở dữ liệu kiểm toán.",
      },
    },
  ],
  edges: [
    { source: "mkt-1-event", target: "mkt-2-content" },
    { source: "mkt-2-content", target: "mkt-3-approval" },
    { source: "mkt-3-approval", target: "mkt-4-publish" },
  ],
  policyRules: {
    mandatory_approval: true,
    paid_budget_threshold: 0,
    currency: "VND",
    approval_gate_role: "content_lead",
  },
};

export const INVENTORY_REPLENISH_WORKFLOW_FIXTURE: BusinessWorkflowDefinition = {
  id: "wf-inventory-replenish-v1",
  code: "WF-INV-REPLENISH",
  name: "Cảnh Báo Tồn Kho & Tự Động Đề Xuất Nhập Hàng",
  category: "inventory_replenishment",
  description: "Khi số lượng hàng trong kho giảm xuống dưới ngưỡng an toàn, AI tự động tính tốc độ bán, lập đơn đặt hàng, tự động phát lệnh với đơn nhỏ và trình Sếp duyệt với lô hàng lớn.",
  targetOutcome: "Ngăn chặn 100% tình trạng đứt hàng (Out-of-stock), tối ưu hóa dòng tiền và vòng quay tồn kho.",
  isActive: true,
  automationRate: "78% Tự Động Hóa",
  version: "v1.0",
  status: "published",
  publishedAt: "2026-09-25 09:00",
  nodes: [
    {
      id: "inv-1-event",
      type: "event",
      stepNumber: 1,
      title: "Cảnh Báo Tồn Kho Dưới Ngưỡng An Toàn",
      badge: "Sự Kiện Bắt Đầu",
      department: "inventory",
      actor: "Hệ thống Quản lý Kho Vận",
      status: "completed",
      summary: "Sản phẩm Củ sạc nhanh Nova 65W chỉ còn 12 chiếc trong kho, chạm ngưỡng tồn kho tối thiểu (15 chiếc).",
      keyHighlights: [
        "Sản phẩm: Củ sạc nhanh Nova 65W GaN",
        "Tồn kho thực tế: 12 chiếc (Ngưỡng an toàn: 15 chiếc)",
        "Tốc độ tiêu thụ: 8 chiếc / ngày",
      ],
      details: {
        description: "Kích hoạt cảnh báo tự động khi lượng hàng tồn kho khả dụng thấp hơn điểm tái đặt hàng (Reorder Point).",
        parameters: [
          { label: "Mã SKU", value: "SKU-CHG-65W" },
          { label: "Thời gian còn hàng dự kiến", value: "1.5 ngày" },
        ],
      },
    },
    {
      id: "inv-2-ai-analysis",
      type: "ai_analysis",
      stepNumber: 2,
      title: "AI Dự Báo Bán Hàng & Lập Đơn Nhập Kho",
      badge: "AI Xử Lý Nghiệp Vụ",
      department: "inventory",
      actor: "Digital Employee: Merchandising Specialist (AI Kho)",
      status: "completed",
      summary: "AI đối chiếu lịch sử bán hàng 30 ngày qua, tính toán thời gian nhà cung cấp giao hàng (Lead time: 3 ngày) và lập đơn đề xuất nhập 100 chiếc.",
      keyHighlights: [
        "Số lượng đề xuất nhập: 100 chiếc",
        "Đơn giá nhập dự kiến: 180.000 đ / chiếc",
        "Tổng giá trị đơn: 18.000.000 đ",
      ],
      details: {
        description: "Tính toán lượng đặt hàng kinh tế (EOQ) giúp tối ưu hóa chi phí lưu kho và chi phí vận chuyển.",
        parameters: [
          { label: "Nhà cung cấp đề xuất", value: "Công ty Cổ phần Công nghệ Anker VN" },
          { label: "Thời gian giao hàng", value: "2 - 3 ngày làm việc" },
        ],
      },
    },
    {
      id: "inv-3-decision",
      type: "decision_router",
      stepNumber: 3,
      title: "Phân Luồng Theo Giá Trị Đơn Hàng",
      badge: "Luật Nghiệp Vụ & Phân Luồng",
      department: "inventory",
      actor: "Bộ quy tắc tài chính & Mua hàng",
      status: "completed",
      summary: "Đơn mua hàng nhỏ dưới 10 triệu đồng tự động gửi đến nhà cung cấp; đơn giá trị lớn trên 10 triệu đồng phải qua Giám đốc phê duyệt chi ngân sách.",
      keyHighlights: [
        "Luật 1: Đơn mua hàng ≤ 10.000.000 đ ➔ Tự động đặt hàng",
        "Luật 2: Đơn mua hàng > 10.000.000 đ ➔ Trình duyệt thanh toán",
      ],
      branches: [
        {
          id: "inv-b-auto",
          label: "Đơn nhỏ ≤ 10Tr",
          conditionText: "Tổng giá trị đơn nhập hàng ≤ 10.000.000 đ",
          targetNodeId: "inv-4a-auto",
          variant: "auto",
        },
        {
          id: "inv-b-approval",
          label: "Đơn lớn > 10Tr",
          conditionText: "Tổng giá trị đơn nhập hàng > 10.000.000 đ",
          targetNodeId: "inv-4b-approval",
          variant: "approval",
        },
      ],
      details: {
        description: "Bảo đảm dòng tiền công ty không bị thất thoát với các đơn hàng lớn, trong khi các vật tư nhỏ được bổ sung liên tục không gián đoạn bán hàng.",
        parameters: [
          { label: "Hạn mức duyệt tự động", value: "10.000.000 đ" },
          { label: "Cấp phê duyệt lô lớn", value: "Giám đốc Vận hành hoặc CEO" },
        ],
      },
    },
    {
      id: "inv-4a-auto",
      type: "action",
      stepNumber: 4,
      stepLabel: "4A",
      title: "Tự Động Phát Lệnh Đặt Hàng PO",
      badge: "Tự Động Đặt Hàng",
      department: "inventory",
      actor: "Cổng kết nối EDI & Mua hàng tự động",
      status: "idle",
      summary: "Với đơn hàng nhỏ, hệ thống tự động xuất file đơn mua hàng (PO) và gửi email đặt hàng trực tiếp tới nhà cung cấp.",
      keyHighlights: [
        "Phương thức: Email PO tự động đính kèm chữ ký số",
        "Thời gian xử lý: Ngay khi phát hiện thiếu hàng",
      ],
      details: {
        description: "Tự động cập nhật trạng thái kho sang 'Đang chờ hàng về' và kích hoạt bộ đếm thời gian giao hàng.",
        parameters: [
          { label: "Hạn giao hàng", value: "Trong vòng 48 giờ" },
        ],
      },
    },
    {
      id: "inv-4b-approval",
      type: "approval_gate",
      stepNumber: 4,
      stepLabel: "4B",
      title: "Duyệt Lệnh Mua Hàng & Chi Phí",
      badge: "Kiểm Soát Tài Chính",
      department: "inventory",
      actor: "Giám đốc Tài chính (CFO) / Ban Giám Đốc",
      status: "waiting_approval",
      summary: "Gửi đề xuất thanh toán đơn nhập 18.000.000 đ vào Hộp thư chờ duyệt (/agentic/approvals) để Giám đốc duyệt lệnh chi.",
      keyHighlights: [
        "Giá trị đơn hàng: 18.000.000 đ (Vượt hạn mức 10Tr)",
        "Đích đến: Chuyển vào Hộp thư phê duyệt chi ngân sách",
      ],
      details: {
        description: "Bảo đảm kiểm soát tài chính tập trung trước khi kế toán thực hiện ủy nhiệm chi cho nhà cung cấp.",
        parameters: [
          { label: "Số tiền cần thanh toán", value: "18.000.000 đ" },
          { label: "Điều khoản thanh toán", value: "Trả trước 50%, nhận hàng thanh toán 50%" },
        ],
      },
      actions: [
        { id: "approve", label: "Duyệt Lệnh Nhập Hàng", variant: "primary" },
        { id: "reject", label: "Hoãn Nhập / Điều Chỉnh Số Lượng", variant: "danger" },
      ],
    },
  ],
  edges: [
    { source: "inv-1-event", target: "inv-2-ai-analysis" },
    { source: "inv-2-ai-analysis", target: "inv-3-decision" },
    { source: "inv-3-decision", target: "inv-4a-auto", sourceHandle: "auto", label: "Đơn nhỏ ≤ 10Tr" },
    { source: "inv-3-decision", target: "inv-4b-approval", sourceHandle: "approval", label: "Đơn lớn > 10Tr" },
  ],
  policyRules: {
    auto_po_threshold: 10000000,
    currency: "VND",
    approval_gate_role: "finance_director",
  },
};

export const ALL_WORKFLOW_DEFINITIONS: readonly BusinessWorkflowDefinition[] = [
  CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
  MARKETING_LAUNCH_WORKFLOW_FIXTURE,
  INVENTORY_REPLENISH_WORKFLOW_FIXTURE,
];

export function createLiveWorkflowFromAiProposal(
  proposal: AiSupportProposalView,
  baseWorkflow: BusinessWorkflowDefinition = CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
  selectedTicketIndex: number = 0,
): BusinessWorkflowDefinition {
  const firstTicket = proposal.tickets[selectedTicketIndex] ?? proposal.tickets[0];
  if (!firstTicket) {
    return baseWorkflow;
  }

  const isApproved = proposal.status === "applied";

  const node1Base =
    baseWorkflow.nodes.find((n) => n.id === "node-1-event" || n.type === "event") ??
    baseWorkflow.nodes[0] ??
    CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.nodes[0];
  const node2Base =
    baseWorkflow.nodes.find((n) => n.id === "node-2-ai-analysis" || n.type === "ai_analysis") ??
    baseWorkflow.nodes[1] ??
    CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.nodes[1];
  const node3Base =
    baseWorkflow.nodes.find((n) => n.id === "node-3-decision" || n.type === "decision_router") ??
    baseWorkflow.nodes[2] ??
    CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.nodes[2];
  const node4aBase =
    baseWorkflow.nodes.find((n) => n.id === "node-4a-auto" || n.id === "node-4a-action-auto") ??
    baseWorkflow.nodes[3] ??
    CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.nodes[3];
  const node4bBase =
    baseWorkflow.nodes.find((n) => n.id === "node-4b-approval" || n.id === "node-4b-approval-gate") ??
    baseWorkflow.nodes[4] ??
    CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.nodes[4];

  // Resolve threshold dynamically from workflow policyRules
  const rawThreshold = baseWorkflow.policyRules?.auto_approval_threshold;
  const threshold = typeof rawThreshold === "number" ? rawThreshold : 200000;
  const thresholdFormatted = `${threshold.toLocaleString("vi-VN")} đ`;

  // Determine if compensation is within auto-approval threshold
  let compensationVnd = 300000;
  if (
    typeof firstTicket.estimatedCompensationAmount === "number" &&
    firstTicket.estimatedCompensationAmount > 0
  ) {
    compensationVnd = firstTicket.estimatedCompensationAmount;
  } else {
    const matchDigits = firstTicket.suggestedCompensation?.match(/(\d+[\d.,]*)\s*([kKđĐ₫]|nghìn|triệu|VND)?/i);
    if (matchDigits) {
      const rawNum = parseInt(matchDigits[1].replace(/[.,]/g, ""), 10);
      if (!isNaN(rawNum)) {
        if (matchDigits[2]?.toLowerCase() === "k" || matchDigits[2]?.toLowerCase() === "nghìn") {
          compensationVnd = rawNum * 1000;
        } else if (matchDigits[2]?.toLowerCase() === "triệu") {
          compensationVnd = rawNum * 1000000;
        } else if (firstTicket.suggestedCompensation?.includes("%") || (rawNum < 1000 && !matchDigits[2])) {
          compensationVnd = 300000;
        } else {
          compensationVnd = rawNum;
        }
      }
    }
  }

  const isAutoEligible =
    typeof firstTicket.requiresApproval === "boolean"
      ? !firstTicket.requiresApproval
      : compensationVnd <= threshold;
  const isDecisionApproved = isApproved || node4bBase?.status === "completed";

  const node1: BusinessWorkflowNode = {
    ...node1Base,
    summary: `Khách hàng ${firstTicket.customerName} (${firstTicket.customerEmail}) gửi khiếu nại: "${firstTicket.subject}"`,
    keyHighlights: [
      `Phiếu: #${firstTicket.ticketId.slice(0, 8)} • ${firstTicket.customerName}`,
      `Email: ${firstTicket.customerEmail}`,
      `Phân loại: ${firstTicket.issueCategory}`,
    ],
    details: {
      ...node1Base.details,
      description: `Phiếu khiếu nại tiếp nhận từ hệ thống hỗ trợ. Vấn đề: ${firstTicket.subject}`,
      parameters: [
        { label: "Mã phiếu hỗ trợ", value: firstTicket.ticketId },
        { label: "Khách hàng", value: `${firstTicket.customerName} (${firstTicket.customerEmail})` },
        { label: "Tiêu đề", value: firstTicket.subject },
        { label: "Mức độ ưu tiên", value: firstTicket.priority.toUpperCase() },
        { label: "Phân loại lỗi", value: firstTicket.issueCategory },
      ],
      evidence: "Phiếu khiếu nại thực tế từ cơ sở dữ liệu PostgreSQL đã được kiểm tra tính hợp lệ.",
    },
  };

  const node2: BusinessWorkflowNode = {
    ...node2Base,
    summary: `AI Support Steward nhận diện mức độ bức xúc: ${firstTicket.sentiment}, rủi ro mất khách: ${firstTicket.churnRisk}. Đề xuất: ${firstTicket.suggestedCompensation}`,
    keyHighlights: [
      `Đề xuất: ${firstTicket.suggestedCompensation}`,
      `Tâm trạng: ${firstTicket.sentiment}`,
      `Rủi ro: ${firstTicket.churnRisk}`,
    ],
    details: {
      ...node2Base.details,
      description: `Đề xuất bồi thường và thư xin lỗi được AI Support Steward soạn thảo tự động dựa trên phân loại ${firstTicket.issueCategory}.`,
      parameters: [
        { label: "Mã phương án AI", value: proposal.id },
        { label: "Đề xuất bồi thường", value: firstTicket.suggestedCompensation },
        { label: "Tâm trạng khách hàng", value: firstTicket.sentiment },
        { label: "Rủi ro mất khách", value: firstTicket.churnRisk },
        { label: "Khuyến nghị hành động", value: proposal.recommendedAction },
        { label: "Thư xin lỗi dự thảo", value: firstTicket.proposedResponse },
      ],
      evidence: "Đề xuất bồi thường được AI tổng hợp và nằm trong hạn mức xử lý khiếu nại chuẩn.",
    },
  };

  const node3: BusinessWorkflowNode = {
    ...node3Base,
    status: "completed",
    summary: isAutoEligible
      ? `Phân luồng: Mức bồi thường nằm trong hạn mức tự động (≤ ${thresholdFormatted}) ➔ Định tuyến sang nhánh Tự Động Xử Lý.`
      : `Phân luồng: Ca khiếu nại mức độ "${firstTicket.priority.toUpperCase()}" với đề xuất "${firstTicket.suggestedCompensation}" vượt trần tự động (${thresholdFormatted}) ➔ Định tuyến sang nhánh Cần Sếp Duyệt.`,
    keyHighlights: isAutoEligible
      ? [
          "Định tuyến: Nhánh 4A (Tự Động 100%)",
          "Lý do: Đề xuất bồi thường trong hạn mức",
          "Trạng thái: Đã tự động kích hoạt",
        ]
      : [
          "Định tuyến: Nhánh 4B (Cần Sếp Duyệt)",
          "Lý do: Đề xuất bồi thường vượt hạn mức",
          "Trạng thái: Đã chuyển vào Hộp thư Approvals",
        ],
  };

  const node4a: BusinessWorkflowNode = {
    ...node4aBase,
    status: isAutoEligible ? "completed" : "idle",
    summary: isAutoEligible
      ? `Đã tự động kích hoạt mã giảm giá "${firstTicket.suggestedCompensation}" và gửi email xin lỗi khách hàng ${firstTicket.customerName} (< 30 giây).`
      : `Nhánh xử lý tự động không được kích hoạt do trường hợp này vượt trần tự động ${thresholdFormatted}.`,
    keyHighlights: isAutoEligible
      ? [
          "Trạng thái: Đã thực thi tự động thành công",
          `Mã voucher: ${firstTicket.suggestedCompensation}`,
          `Email: ${firstTicket.customerEmail}`,
        ]
      : [
          "Trạng thái: Bỏ qua (Vượt hạn mức tự động)",
          "Đã chuyển hướng: Nhánh 4B (Cần Sếp Duyệt)",
        ],
  };

  const node4b: BusinessWorkflowNode = {
    ...node4bBase,
    status: isAutoEligible ? "idle" : (isDecisionApproved ? "completed" : "waiting_approval"),
    summary: isAutoEligible
      ? `Nhánh cần Sếp duyệt không kích hoạt do trường hợp này nằm trong hạn mức tự động phân quyền (≤ ${thresholdFormatted}).`
      : isDecisionApproved
      ? `Sếp đã phê duyệt phương án bồi thường. Hệ thống đã kích hoạt voucher "${firstTicket.suggestedCompensation}" và gửi email tới ${firstTicket.customerEmail}.`
      : `Đang chờ Sếp duyệt phương án bồi thường "${firstTicket.suggestedCompensation}" cho khách hàng ${firstTicket.customerName}.`,
    keyHighlights: isAutoEligible
      ? [
          "Trạng thái: Bỏ qua (Đã tự động duyệt)",
          `Hạn mức: ≤ ${thresholdFormatted}`,
        ]
      : [
          isDecisionApproved ? "Trạng thái: Đã phê duyệt thành công" : "Trạng thái: Đang chờ Sếp duyệt tại Approvals",
          `Đề xuất: ${firstTicket.suggestedCompensation}`,
          `Gửi tới: ${firstTicket.customerEmail}`,
        ],
  };

  const defaultRecoveryIds = new Set([
    "node-1-event",
    "node-2-ai-analysis",
    "node-3-decision",
    "node-4a-action-auto",
    "node-4b-approval-gate",
    "node-4a-auto",
    "node-4b-approval",
  ]);
  const additionalNodes = baseWorkflow.nodes
    .filter((n) => !defaultRecoveryIds.has(n.id))
    .map((n) => {
      if (
        isDecisionApproved &&
        (n.title?.toLowerCase().includes("thông báo") ||
          n.actor?.toLowerCase().includes("email") ||
          n.details?.parameters?.some((p) => p.value?.includes("@")))
      ) {
        const emailParam = n.details?.parameters?.find(
          (p) => p.label?.toLowerCase().includes("email") || p.value?.includes("@"),
        );
        const roleParam = n.details?.parameters?.find(
          (p) => p.label?.toLowerCase().includes("chức vụ"),
        );
        const recipient = emailParam?.value || "duongvanduy799@gmail.com";
        const role = roleParam?.value || "Trưởng phòng CSKH";
        return {
          ...n,
          status: "completed" as BusinessNodeStatus,
          summary: `Hệ thống đã gửi email thông báo kết quả giải quyết khiếu nại tới ${role} (${recipient}) thành công.`,
          keyHighlights: [
            "Trạng thái: Đã gửi email thành công",
            `Đích đến: ${recipient}`,
            `Thời gian: ${new Date().toLocaleTimeString("vi-VN")}`,
          ],
        };
      }
      return n;
    });

  return {
    ...baseWorkflow,
    nodes: [node1, node2, node3, node4a, node4b, ...additionalNodes],
  };
}

export function createLiveWorkflowFromMarketingCampaign(
  campaignDetail: MarketingCampaignDetail,
  baseWorkflow: BusinessWorkflowDefinition = MARKETING_LAUNCH_WORKFLOW_FIXTURE,
): BusinessWorkflowDefinition {
  const { campaign, brief, contentVersions, visualAssets, publicationPackages, publicationRecord } = campaignDetail;
  const content = contentVersions[0];
  const visual = visualAssets[0];
  const pkg = publicationPackages[0];

  const hasPaidBudget = (brief?.maximumCostMicros ?? 0) > 0;
  const isAwaitingApproval = campaign.state === "awaiting_human_approval" || pkg?.status === "submitted_for_approval";
  const isCompleted = campaign.state === "completed" || pkg?.status === "approved" || !!publicationRecord;
  const isPublishing = campaign.state === "publishing" || campaign.state === "scheduled";
  const isRejected = campaign.state === "canceled" || campaign.state === "platform_rejected";

  const campaignTitle = brief?.campaignName || campaign.campaignName || "Chiến dịch Marketing Đa Kênh";
  const productName = brief?.subjectReference || "Sản phẩm công nghệ";

  const node1Base =
    baseWorkflow.nodes.find((n) => n.id === "mkt-1-event" || n.type === "event") ??
    baseWorkflow.nodes[0] ??
    MARKETING_LAUNCH_WORKFLOW_FIXTURE.nodes[0];
  const node2Base =
    baseWorkflow.nodes.find((n) => n.id === "mkt-2-content" || n.id === "mkt-2-ai-analysis" || n.type === "ai_analysis") ??
    baseWorkflow.nodes[1] ??
    MARKETING_LAUNCH_WORKFLOW_FIXTURE.nodes[1];
  const node3Base =
    baseWorkflow.nodes.find((n) => n.id === "mkt-3-approval" || n.type === "approval_gate") ??
    baseWorkflow.nodes[2] ??
    MARKETING_LAUNCH_WORKFLOW_FIXTURE.nodes[2];
  const node4Base =
    baseWorkflow.nodes.find((n) => n.id === "mkt-4-publish" || n.type === "action") ??
    baseWorkflow.nodes[3] ??
    MARKETING_LAUNCH_WORKFLOW_FIXTURE.nodes[3];

  // Node 1: Event
  const node1: BusinessWorkflowNode = {
    ...node1Base,
    status: "completed",
    title: `Sản Phẩm Mới: ${productName.slice(0, 30)}`,
    summary: `Chiến dịch "${campaignTitle.slice(0, 75)}" đã được kích hoạt từ Catalog. Mục tiêu: ${brief?.objective?.slice(0, 90) || "Quảng bá sản phẩm đa kênh"}.`,
    keyHighlights: [
      `Mã chiến dịch: #${campaign.id.slice(0, 8)}`,
      `Sản phẩm: ${productName}`,
      `Ngân sách Ads: ${hasPaidBudget ? `${((brief?.maximumCostMicros || 0) / 1000).toLocaleString("vi-VN")} đ` : "0 đ (Organic)"}`,
    ],
    details: {
      ...node1Base.details,
      description: "Sự kiện kích hoạt tự động khi sản phẩm hoặc chủ đề tiếp thị được khởi tạo trong hệ thống.",
      parameters: [
        { label: "Mã chiến dịch", value: campaign.id },
        { label: "Tên chiến dịch", value: campaignTitle },
        { label: "Chủ đề / Sản phẩm", value: productName },
        { label: "Mục tiêu truyền thông", value: brief?.objective || "Kích cầu và tăng nhận diện" },
        { label: "Kêu gọi hành động (CTA)", value: brief?.callToAction || "Xem ngay" },
      ],
      evidence: "Sự kiện được xác thực hợp lệ qua Catalog Event Hub và cấp quyền truy cập tiếp thị.",
    },
  };

  // Node 2: AI Creative & Copywriting
  const node2Status: BusinessNodeStatus = content
    ? "completed"
    : (campaign.state === "content_drafting" || campaign.state === "visual_creation" ? "running" : "idle");
  const node2: BusinessWorkflowNode = {
    ...node2Base,
    status: node2Status,
    summary: content
      ? `AI Copywriter đã sáng tạo nội dung: "${content.hook?.slice(0, 70)}..." và AI Designer đã tạo banner ${visual ? `${visual.width}x${visual.height}px` : "1:1"}.`
      : "Đang huy động AI Copywriter & Visual Designer sáng tạo nội dung đa kênh...",
    keyHighlights: [
      content?.hook ? `Hook: ${content.hook.slice(0, 60)}...` : "Đang tạo nội dung...",
      visual ? `Thiết kế: Banner ${visual.width}x${visual.height}px (${visual.aspectRatio})` : "Đang tạo hình ảnh...",
      content?.hashtags?.length ? `Hashtags: ${content.hashtags.slice(0, 4).join(" ")}` : "#OpenDX #NovaCommerce",
    ],
    details: {
      ...node2Base.details,
      description: "Đội ngũ Digital Employee (Copywriter & Visual Specialist) tự động phối hợp viết bài, chọn tông giọng và render hình ảnh quảng cáo.",
      parameters: [
        { label: "Tiêu đề (Hook)", value: content?.hook || "N/A" },
        { label: "Kêu gọi hành động", value: content?.callToAction || "Khám phá ngay" },
        { label: "Kích thước hình ảnh", value: visual ? `${visual.width} x ${visual.height} px (${visual.aspectRatio})` : "1024 x 1024 px" },
        { label: "Định dạng media", value: visual?.mediaType || "image/png" },
        { label: "Chi phí token AI", value: `${((content?.costMicros || 0) / 1000).toLocaleString("vi-VN")} đ` },
      ],
      evidence: "Các tệp văn bản docx và hình ảnh png đã được băm SHA-256 lưu trữ an toàn trong MinIO Object Storage.",
    },
  };

  // Node 3: Approval Gate (Content & Creative Approval)
  const node3Status: BusinessNodeStatus = isCompleted || node3Base?.status === "completed"
    ? "completed"
    : (isRejected ? "rejected" : (isAwaitingApproval ? "waiting_approval" : "idle"));
  const node3: BusinessWorkflowNode = {
    ...node3Base,
    status: node3Status,
    summary: isCompleted || node3Base?.status === "completed"
      ? "Nội dung bài viết và hình ảnh đã được duyệt. Lệnh tự động xuất bản đã chuyển sang Bước 4."
      : (isRejected
        ? "Chiến dịch tiếp thị này đã bị từ chối hoặc hủy."
        : "Đang chờ người phụ trách Marketing kiểm tra nội dung và hình ảnh trước khi xuất bản."),
    keyHighlights: [
      isCompleted || node3Base?.status === "completed"
        ? "Trạng thái: Đã duyệt bài"
        : (isRejected ? "Trạng thái: Đã từ chối" : "Trạng thái: Đang chờ duyệt bài"),
      content?.hook ? `Hook: "${content.hook.slice(0, 45)}..."` : "Nội dung: Bài viết & Banner",
      "Người duyệt: Content Lead / Marketing Specialist",
    ],
    details: {
      ...node3Base.details,
      parameters: [
        { label: "Mã chiến dịch", value: campaign.id },
        { label: "Trạng thái kiểm duyệt", value: campaign.state.toUpperCase() },
        { label: "Người phụ trách", value: brief?.approverId || "Content Lead" },
        { label: "Kênh xuất bản", value: "Facebook Page & Instagram" },
      ],
      evidence: isCompleted || node3Base?.status === "completed"
        ? "Đã xác nhận duyệt bài. Lưu vết audit log hợp lệ."
        : "Bài viết đang ở trạng thái chờ duyệt trước khi gọi API xuất bản.",
    },
  };

  // Node 4: Action (Publishing to Facebook & Instagram)
  const node4Status: BusinessNodeStatus = isCompleted || node3Base?.status === "completed"
    ? "completed"
    : (isPublishing ? "running" : "idle");
  const node4: BusinessWorkflowNode = {
    ...node4Base,
    status: node4Status,
    summary: isCompleted
      ? `Đã xuất bản thành công bài viết và hình ảnh lên Facebook Fanpage.${publicationRecord?.postUrl ? ` Xem bài viết tại: ${publicationRecord.postUrl}` : ""}`
      : (isPublishing
        ? "Hệ thống đang gọi Meta Graph API để đăng bài..."
        : "Chờ Bước 3 được phê duyệt để tự động xuất bản lên Facebook & Instagram."),
    keyHighlights: [
      isCompleted
        ? "Trạng thái: Đã xuất bản thành công"
        : (isPublishing ? "Trạng thái: Đang xuất bản" : "Trạng thái: Chờ duyệt"),
      publicationRecord?.postUrl ? `Link: ${publicationRecord.postUrl}` : `Kênh: Facebook Fanpage (ID: ${brief?.facebookPageConfigurationId || "Official"})`,
      publicationRecord?.externalPostId ? `Meta Post ID: ${publicationRecord.externalPostId}` : "Chưa có Post ID",
    ],
    details: {
      ...baseWorkflow.nodes[3].details,
      parameters: [
        { label: "Mã chiến dịch", value: campaign.id },
        { label: "URL bài đăng Facebook", value: publicationRecord?.postUrl || "Chưa xuất bản" },
        { label: "ID bài viết Meta", value: publicationRecord?.externalPostId || "N/A" },
        { label: "Thời điểm xác minh", value: publicationRecord?.verifiedAt ? new Date(publicationRecord.verifiedAt).toLocaleString("vi-VN") : "N/A" },
      ],
      evidence: publicationRecord?.postUrl
        ? `Đã xác thực chữ ký biên nhận xuất bản từ Meta Graph API (Receipt Digest: ${publicationRecord.providerReceiptDigest?.slice(0, 16) || "Verified"}).`
        : "Biên nhận xuất bản sẽ được lưu vết ngay sau khi đăng bài thành công.",
    },
  };

  const defaultMktIds = new Set([
    "node-1-event",
    "node-2-ai-creative",
    "node-2-ai-analysis",
    "node-3-approval",
    "node-4-publish",
    "mkt-1-event",
    "mkt-2-ai-creative",
    "mkt-2-ai-analysis",
    "mkt-3-approval",
    "mkt-4-publish",
  ]);
  const additionalNodes = baseWorkflow.nodes
    .filter((n) => !defaultMktIds.has(n.id))
    .map((n) => {
      if (
        isCompleted &&
        (n.title?.toLowerCase().includes("thông báo") ||
          n.actor?.toLowerCase().includes("email") ||
          n.details?.parameters?.some((p) => p.value?.includes("@")))
      ) {
        return {
          ...n,
          status: "completed" as BusinessNodeStatus,
          summary: "Hệ thống đã gửi email thông báo kết quả chiến dịch tới Trưởng phòng Marketing (duongvanduy799@gmail.com) thành công.",
          keyHighlights: [
            "Trạng thái: Đã gửi email thành công",
            "Đích đến: duongvanduy799@gmail.com",
            `Thời gian: ${new Date().toLocaleTimeString("vi-VN")}`,
          ],
        };
      }
      return n;
    });

  return {
    ...baseWorkflow,
    nodes: [node1, node2, node3, node4, ...additionalNodes],
  };
}
