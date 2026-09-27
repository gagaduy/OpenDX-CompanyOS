// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../shared/database/transaction";

export const SEEDED_WORKFLOW_BLUEPRINTS = [
  {
    id: "wf-customer-recovery-v1",
    code: "WF-CSKH-RECOVERY",
    name: "Cứu Khách Hàng Khiếu Nại & Bồi Thường Nhanh",
    category: "customer_recovery",
    description: "Tự động phân loại bức xúc của khách hàng, huy động AI CSKH lập phương án bồi thường thiện chí và xin lỗi, tự động giải quyết các ca nhỏ và chỉ chuyển Sếp duyệt khi vượt hạn mức.",
    targetOutcome: "Xoa dịu khách hàng trong vòng 5 phút, giữ chân khách quen và ngăn chặn nguy cơ đánh giá tiêu cực công khai.",
    version: "v1.0",
    status: "published",
    policyRules: {
      auto_approval_threshold: 200000,
      currency: "VND",
      approval_gate_role: "support_manager",
    },
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
          "Luật 1: Bồi thường ≤ 2.000.000 đ ➔ Tự động xử lý ngay",
          "Luật 2: Bồi thường > 2.000.000 đ hoặc VIP ➔ Chờ Sếp duyệt",
        ],
        branches: [
          {
            id: "b-auto",
            label: "Tự động ≤ 2Tr",
            conditionText: "Bồi thường ≤ 2.000.000 đ & Khách thông thường",
            targetNodeId: "node-4a-auto",
            variant: "auto",
          },
          {
            id: "b-approval",
            label: "Cần Sếp duyệt > 2Tr",
            conditionText: "Bồi thường > 2.000.000 đ hoặc Khách VIP Diamond",
            targetNodeId: "node-4b-approval",
            variant: "approval",
          },
        ],
        details: {
          description: "Tránh làm phiền ban giám đốc với các sự vụ nhỏ lẻ, đồng thời kiểm soát chặt chẽ ngân sách bồi thường lớn.",
          parameters: [
            { label: "Hạn mức tự động duyệt", value: "2.000.000 đ / ca khiếu nại" },
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
          "Điều kiện: Ca khiếu nại nhỏ ≤ 2.000.000 đ",
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
          "Hạn mức thẩm quyền: > 2.000.000 đ hoặc Khách VIP",
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
      { source: "node-3-decision", target: "node-4a-auto", sourceHandle: "auto", label: "Tự động ≤ 2Tr" },
      { source: "node-3-decision", target: "node-4b-approval", sourceHandle: "approval", label: "Cần Sếp duyệt > 2Tr" },
    ],
  },
  {
    id: "wf-marketing-launch-v1",
    code: "WF-MKT-LAUNCH",
    name: "Kích Hoạt Chiến Dịch Marketing & Đa Kênh",
    category: "marketing_campaign",
    description: "Khi có sản phẩm mới xuất bản, AI tự động viết bài truyền thông, tạo ảnh banner, chuyển sang bước duyệt bài và tự động đăng bài đa kênh lên Facebook & Instagram.",
    targetOutcome: "Phủ sóng sản phẩm mới trên mạng xã hội trong 10 phút, kiểm soát chất lượng nội dung trước khi xuất bản.",
    version: "v1.0",
    status: "published",
    policyRules: {
      mandatory_approval: true,
      paid_budget_threshold: 0,
      currency: "VND",
      approval_gate_role: "content_lead",
    },
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
        id: "mkt-2-content",
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
  },
  {
    id: "wf-inventory-replenish-v1",
    code: "WF-INV-REPLENISH",
    name: "Cảnh Báo Tồn Kho & Tự Động Đề Xuất Nhập Hàng",
    category: "inventory_replenishment",
    description: "Khi số lượng hàng trong kho giảm xuống dưới ngưỡng an toàn, AI tự động tính tốc độ bán, lập đơn đặt hàng, tự động phát lệnh với đơn nhỏ và trình Sếp duyệt với lô hàng lớn.",
    targetOutcome: "Ngăn chặn 100% tình trạng đứt hàng (Out-of-stock), tối ưu hóa dòng tiền và vòng quay tồn kho.",
    version: "v1.0",
    status: "published",
    policyRules: {
      auto_po_threshold: 10000000,
      currency: "VND",
      approval_gate_role: "finance_director",
    },
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
  },
];

export async function seedWorkflowBlueprints(transactions: TransactionRunner): Promise<void> {
  await transactions.run(async (session) => {
    for (const wf of SEEDED_WORKFLOW_BLUEPRINTS) {
      await session.query(
        `INSERT INTO workflow_blueprints (
          id, code, name, category, description, target_outcome, version, status, policy_rules, nodes, edges, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, NOW())
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          target_outcome = EXCLUDED.target_outcome,
          nodes = CASE
            WHEN workflow_blueprints.nodes IS NULL OR jsonb_array_length(workflow_blueprints.nodes) = 0
            THEN EXCLUDED.nodes
            ELSE workflow_blueprints.nodes
          END,
          edges = CASE
            WHEN workflow_blueprints.edges IS NULL OR jsonb_array_length(workflow_blueprints.edges) = 0
            THEN EXCLUDED.edges
            ELSE workflow_blueprints.edges
          END,
          policy_rules = CASE
            WHEN workflow_blueprints.policy_rules IS NULL OR workflow_blueprints.policy_rules = '{}'::jsonb
            THEN EXCLUDED.policy_rules
            ELSE workflow_blueprints.policy_rules
          END,
          updated_at = NOW()`,
        [
          wf.id,
          wf.code,
          wf.name,
          wf.category,
          wf.description,
          wf.targetOutcome,
          wf.version,
          wf.status,
          JSON.stringify(wf.policyRules),
          JSON.stringify(wf.nodes),
          JSON.stringify(wf.edges),
        ],
      );
    }
  });
}
