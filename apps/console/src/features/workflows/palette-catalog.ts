// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { BusinessNodeType, BusinessWorkflowNode, WorkflowConditionBranch } from "./types";

export interface PaletteNodeTemplate {
  readonly id: string;
  readonly category: "trigger" | "ai_agent" | "decision_router" | "approval_gate" | "action";
  readonly type: BusinessNodeType;
  readonly name: string;
  readonly badge: string;
  readonly description: string;
  readonly department: "support" | "inventory" | "marketing" | "finance";
  readonly actor: string;
  readonly keyHighlight: string;
  readonly defaultBranches?: readonly WorkflowConditionBranch[];
  readonly defaultParameters: readonly { label: string; value: string }[];
}

export const PALETTE_CATEGORIES = [
  { id: "trigger", label: "Sự Kiện Kích Hoạt", color: "#10b981", count: 3 },
  { id: "ai_agent", label: "Nhân Viên Số AI", color: "#a855f7", count: 3 },
  { id: "decision_router", label: "Phân Luồng Chính Sách", color: "#6366f1", count: 1 },
  { id: "approval_gate", label: "Cổng Phê Duyệt", color: "#f59e0b", count: 3 },
  { id: "action", label: "Hành Động Tự Động", color: "#38bdf8", count: 4 },
] as const;

export const PALETTE_NODE_TEMPLATES: readonly PaletteNodeTemplate[] = [
  // 1. Triggers (Sự Kiện Kích Hoạt)
  {
    id: "tpl-trigger-complaint",
    category: "trigger",
    type: "event",
    name: "Tiếp Nhận Khiếu Nại Đa Kênh",
    badge: "Sự Kiện Bắt Đầu",
    description: "Kích hoạt khi hòm thư hỗ trợ nhận được email bức xúc hoặc đánh giá tiêu cực từ khách hàng.",
    department: "support",
    actor: "Hệ thống tiếp nhận đa kênh",
    keyHighlight: "Kênh: Email hỗ trợ (support@novacommerce.vn)",
    defaultParameters: [
      { label: "Nguồn tiếp nhận", value: "Inbound Email / Webhook" },
      { label: "Bộ lọc tự động", value: "Độ bức xúc ≥ Trung bình" },
    ],
  },
  {
    id: "tpl-trigger-catalog-product",
    category: "trigger",
    type: "event",
    name: "Sản Phẩm Mới Trong Catalog",
    badge: "Sự Kiện Bắt Đầu",
    description: "Kích hoạt ngay khi sản phẩm mới được duyệt và chuyển trạng thái 'Đang bán' trên Storefront.",
    department: "marketing",
    actor: "Hệ thống Quản lý Danh mục (Catalog)",
    keyHighlight: "Sự kiện: Xuất bản sản phẩm mới",
    defaultParameters: [
      { label: "Kênh áp dụng", value: "Website bán hàng chính thức" },
      { label: "Yêu cầu", value: "Đã có ảnh sản phẩm và giá niêm yết" },
    ],
  },
  {
    id: "tpl-trigger-stock-warning",
    category: "trigger",
    type: "event",
    name: "Cảnh Báo Tồn Kho Dưới Ngưỡng",
    badge: "Sự Kiện Bắt Đầu",
    description: "Kích hoạt khi số lượng tồn kho khả dụng giảm xuống dưới ngưỡng an toàn (Safety Stock).",
    department: "inventory",
    actor: "Hệ thống Quản lý Kho Vận",
    keyHighlight: "Ngưỡng kích hoạt: Tồn kho < 15 chiếc",
    defaultParameters: [
      { label: "Thời điểm quét", value: "Thời gian thực (Real-time)" },
      { label: "Loại cảnh báo", value: "Chạm ngưỡng tái đặt hàng (ROP)" },
    ],
  },

  // 2. AI Agents (Nhân Viên Số AI)
  {
    id: "tpl-ai-support-steward",
    category: "ai_agent",
    type: "ai_analysis",
    name: "AI Phân Tích & Đề Xuất Bồi Thường",
    badge: "AI Xử Lý Nghiệp Vụ",
    description: "AI đọc hiểu ngữ cảnh, đo mức độ bức xúc, đối chiếu chính sách bảo hành và soạn sẵn thư xin lỗi kèm voucher.",
    department: "support",
    actor: "Digital Employee: Support Steward",
    keyHighlight: "Thời gian phản hồi AI: < 2 giây",
    defaultParameters: [
      { label: "Nhiệm vụ", value: "Phân loại lỗi, đo churn risk, tính tiền bồi thường" },
      { label: "Văn phong", value: "Đồng cảm, trang trọng, giải quyết thấu đáo" },
    ],
  },
  {
    id: "tpl-ai-marketing-specialist",
    category: "ai_agent",
    type: "ai_analysis",
    name: "AI Sáng Tạo Nội Dung & Banner",
    badge: "AI Xử Lý Nghiệp Vụ",
    description: "AI tự động phân tích tính năng sản phẩm, tạo 3 bản copy hấp dẫn và thiết kế ảnh banner chuẩn kích thước mạng xã hội.",
    department: "marketing",
    actor: "Digital Employee: Campaign Specialist",
    keyHighlight: "Đầu ra: 3 bài viết + 2 mẫu banner",
    defaultParameters: [
      { label: "Kênh phát hành", value: "Facebook Fanpage, Instagram Story" },
      { label: "Thời gian xử lý", value: "4.5 giây" },
    ],
  },
  {
    id: "tpl-ai-inventory-specialist",
    category: "ai_agent",
    type: "ai_analysis",
    name: "AI Dự Báo Bán Hàng & Đặt Hàng",
    badge: "AI Xử Lý Nghiệp Vụ",
    description: "AI tính tốc độ bán, thời gian giao hàng của đối tác và tính toán lượng đặt hàng kinh tế (EOQ) tối ưu chi phí.",
    department: "inventory",
    actor: "Digital Employee: Merchandising Specialist",
    keyHighlight: "Tính toán lượng đặt hàng kinh tế (EOQ)",
    defaultParameters: [
      { label: "Thuật toán dự báo", value: "Moving Average 30 ngày + Lead time" },
      { label: "Mục tiêu", value: "Đảm bảo hàng về trước khi cạn kho" },
    ],
  },

  // 3. Decision Routers (Phân Luồng Chính Sách)
  {
    id: "tpl-router-threshold",
    category: "decision_router",
    type: "decision_router",
    name: "Phân Luồng Theo Hạn Mức Tiền",
    badge: "Luật Nghiệp Vụ & Phân Luồng",
    description: "Kiểm tra giá trị bồi thường hoặc quy mô đơn hàng: Dưới trần tự động xử lý, vượt trần chuyển người có thẩm quyền duyệt.",
    department: "support",
    actor: "Bộ quy tắc chính sách (Policy Engine)",
    keyHighlight: "Ngưỡng tự động: ≤ 200.000 đ",
    defaultBranches: [
      {
        id: "b-auto",
        label: "Tự động ≤ 200k",
        conditionText: "Giá trị ≤ 200.000 đ",
        targetNodeId: "",
        variant: "auto",
      },
      {
        id: "b-approval",
        label: "Cần duyệt > 200k",
        conditionText: "Giá trị > 200.000 đ",
        targetNodeId: "",
        variant: "approval",
      },
    ],
    defaultParameters: [
      { label: "Hạn mức tự duyệt", value: "200.000 đ" },
      { label: "Nguyên tắc", value: "Dưới trần tự động 100%, vượt trần chuyển duyệt" },
    ],
  },

  // 4. Approval Gates (Cổng Phê Duyệt)
  {
    id: "tpl-gate-support-lead",
    category: "approval_gate",
    type: "approval_gate",
    name: "Duyệt Phương Án Bồi Thường CSKH",
    badge: "Cổng Kiểm Soát Nghiệp Vụ",
    description: "Gửi hồ sơ vào Hộp thư phê duyệt (/agentic/approvals) để Trưởng bộ phận CSKH duyệt phương án bồi thường lớn.",
    department: "support",
    actor: "Trưởng bộ phận CSKH",
    keyHighlight: "Cần duyệt trước khi phát voucher",
    defaultParameters: [
      { label: "Cấp phê duyệt", value: "Trưởng phòng CSKH" },
      { label: "Thời hạn chờ", value: "Khuyến nghị trong 30 phút" },
    ],
  },
  {
    id: "tpl-gate-marketing-lead",
    category: "approval_gate",
    type: "approval_gate",
    name: "Duyệt Bài Viết Trước Khi Đăng",
    badge: "Kiểm Duyệt Nội Dung",
    description: "Kiểm tra thông điệp, câu từ và hình ảnh do AI tạo ra trước khi xuất bản lên mạng xã hội.",
    department: "marketing",
    actor: "Content Lead / Marketing Specialist",
    keyHighlight: "Kiểm tra trước khi xuất bản Meta",
    defaultParameters: [
      { label: "Người kiểm duyệt", value: "Content Lead" },
      { label: "Kênh phát hành", value: "Facebook & Instagram" },
    ],
  },
  {
    id: "tpl-gate-cfo-signoff",
    category: "approval_gate",
    type: "approval_gate",
    name: "Duyệt Lệnh Mua Hàng & Chi Phí",
    badge: "Kiểm Soát Tài Chính",
    description: "Xem xét và ký duyệt đơn đặt hàng số lượng lớn hoặc các khoản chi ngân sách vượt hạn mức.",
    department: "finance",
    actor: "Giám đốc Tài chính (CFO) / Quản lý Kho",
    keyHighlight: "Kiểm soát an toàn tài chính doanh nghiệp",
    defaultParameters: [
      { label: "Thẩm quyền", value: "Giám đốc Tài chính / CEO" },
      { label: "Hạn mức xét duyệt", value: "Các khoản chi > 10.000.000 đ" },
    ],
  },

  // 5. Actions (Hành Động Tự Động)
  {
    id: "tpl-action-send-email",
    category: "action",
    type: "action",
    name: "Tự Động Kích Hoạt Voucher & Gửi Mail",
    badge: "Tự Động Thực Thi",
    description: "Kích hoạt mã voucher trên hệ thống bán hàng và gửi email xin lỗi trực tiếp tới hộp thư của khách qua máy chủ SMTP.",
    department: "support",
    actor: "Hệ thống gửi thư NovaCare",
    keyHighlight: "Gửi thư tự động qua máy chủ SMTP",
    defaultParameters: [
      { label: "Kênh gửi", value: "Máy chủ SMTP chính thức (noreply@novacommerce.vn)" },
      { label: "Thời gian gửi", value: "Tức thì (< 30 giây)" },
    ],
  },
  {
    id: "tpl-action-publish-social",
    category: "action",
    type: "action",
    name: "Tự Động Đăng Bài Lên Facebook & Instagram",
    badge: "Tự Động Xuất Bản",
    description: "Gọi trực tiếp Meta Graph API để đăng bài viết và hình ảnh lên fanpage chính thức và tài khoản Instagram của công ty.",
    department: "marketing",
    actor: "Facebook & Instagram Publishing Engine",
    keyHighlight: "Xuất bản đa kênh Meta tự động",
    defaultParameters: [
      { label: "Kênh đích", value: "Facebook Fanpage & Instagram Business" },
      { label: "Trạng thái", value: "Công khai ngay lập tức" },
    ],
  },
  {
    id: "tpl-action-issue-po",
    category: "action",
    type: "action",
    name: "Tự Động Phát Lệnh Đặt Hàng PO",
    badge: "Tự Động Đặt Hàng",
    description: "Tạo đơn mua hàng chính thức kèm chữ ký số điện tử và gửi email đặt hàng tới nhà phân phối.",
    department: "inventory",
    actor: "Cổng kết nối EDI & Mua hàng tự động",
    keyHighlight: "Xuất file PO và gửi email nhà cung cấp",
    defaultParameters: [
      { label: "Định dạng file", value: "PDF kèm chữ ký số công ty" },
      { label: "Thời hạn giao hàng", value: "Theo hợp đồng khung đã ký" },
    ],
  },
  {
    id: "tpl-action-send-internal-email",
    category: "action",
    type: "action",
    name: "Gửi Email Thông Báo Cho Chức Vụ",
    badge: "Thông Báo Nội Bộ",
    description: "Tự động gửi email thông báo kết quả hoặc cảnh báo cho nhân sự theo chức vụ (ví dụ: Trưởng phòng Marketing) hoặc địa chỉ Gmail cụ thể.",
    department: "marketing",
    actor: "Dịch Vụ Email Thông Báo Nội Bộ",
    keyHighlight: "Gửi tới: Trưởng phòng Marketing (duongvanduy799@gmail.com)",
    defaultParameters: [
      { label: "Chế độ người nhận", value: "Theo chức vụ trong công ty" },
      { label: "Chức vụ người nhận", value: "Trưởng phòng Marketing" },
      { label: "Email nhận thông báo", value: "duongvanduy799@gmail.com" },
      { label: "Tiêu đề email", value: "[Thông Báo Nội Bộ] Nhiệm vụ quy trình đã hoàn tất thành công" },
      { label: "Mức độ ưu tiên", value: "Quan trọng" },
    ],
  },
];

export function createNodeFromPaletteTemplate(
  template: PaletteNodeTemplate,
  stepNumber: number,
  stepLabel?: string,
): BusinessWorkflowNode {
  return {
    id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: template.type,
    stepNumber,
    stepLabel: stepLabel ?? `${stepNumber}`,
    title: template.name,
    badge: template.badge,
    department: template.department,
    actor: template.actor,
    status: "idle",
    summary: template.description,
    keyHighlights: [template.keyHighlight],
    branches: template.defaultBranches,
    details: {
      description: template.description,
      parameters: template.defaultParameters,
      evidence: "Được khởi tạo từ Thư viện Khối Nghiệp Vụ chuẩn của OpenDX CompanyOS.",
    },
    actions:
      template.type === "approval_gate"
        ? [
            { id: "approve", label: "Đồng Ý Duyệt", variant: "primary" },
            { id: "reject", label: "Từ Chối", variant: "danger" },
          ]
        : undefined,
  };
}
