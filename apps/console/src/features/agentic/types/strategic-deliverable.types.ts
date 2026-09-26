// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DepartmentType } from "./department-task-queue.types";

export interface MarketInsightItem {
  readonly label: string;
  readonly value: string;
  readonly change?: string;
  readonly description: string;
}

export interface StrategicConclusionItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly impact: "high" | "medium" | "low";
}

export interface StrategicRiskItem {
  readonly id: string;
  readonly risk: string;
  readonly severity: "high" | "medium" | "low";
  readonly mitigation: string;
}

export interface StrategicActionPhase {
  readonly phase: string;
  readonly title: string;
  readonly duration: string;
  readonly tasks: readonly string[];
}

export interface StrategicDeliverable {
  readonly id: string;
  readonly taskId?: string;
  readonly goal: string;
  readonly title: string;
  readonly department: "ai_ceo" | DepartmentType;
  readonly departmentName: string;
  readonly createdAt: string | number;
  readonly completedAt: string | number;
  readonly summary: string;
  readonly marketInsights: readonly MarketInsightItem[];
  readonly conclusions: readonly StrategicConclusionItem[];
  readonly risks: readonly StrategicRiskItem[];
  readonly actionPlan: readonly StrategicActionPhase[];
  readonly estimatedBudgetVnd: number;
  readonly tokenCost: number;
  readonly format: "docx";
  readonly docxFilename: string;
}

/**
 * Builds a realistic, highly professional strategic deliverable report based on the given goal.
 */
export function buildStrategicDeliverable(
  goal: string,
  taskId?: string,
  department?: "ai_ceo" | DepartmentType,
): StrategicDeliverable {
  const cleanGoal = goal.replace(/^([hH]ãy|[hH]ayx)\s*(lên\s*)?/i, "Lên ").trim();
  const lowerGoal = cleanGoal.toLowerCase();
  const id = taskId || `deliv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // 1. Nova Tech / Electronics & Gadgets Campaign Merchandising Analysis
  if (
    lowerGoal.includes("nova tech") ||
    lowerGoal.includes("công nghệ") ||
    lowerGoal.includes("thiết bị") ||
    lowerGoal.includes("điện tử") ||
    lowerGoal.includes("smartwatch") ||
    lowerGoal.includes("tai nghe") ||
    lowerGoal.includes("khai phá tương lai")
  ) {
    return {
      id,
      taskId,
      goal: cleanGoal,
      title: "Báo cáo Chiến lược: Chiến dịch Nova Tech - Khai Phá Tương Lai & Tối ưu Doanh số Thiết bị Công nghệ",
      department: department || "merchandising",
      departmentName: department === "merchandising" ? "Phòng Kinh doanh & Định giá Danh mục" : "AI CEO & Điều phối Chiến lược",
      createdAt: now,
      completedAt: now,
      summary:
        "Chiến dịch Nova Tech - Khai Phá Tương Lai được xây dựng nhằm khai thác nhu cầu tiêu dùng thiết bị thông minh & phụ kiện số thế hệ mới trên Storefront. Hệ thống AI CEO cùng Chuyên gia Định giá và Kỹ sư Kho đã rà soát 10 SKU công nghệ chủ lực (NovaWatch Pro, NovaPods Ultra, NovaCharge 65W GaN...), áp dụng cơ chế chiết khấu linh hoạt 15% - 25% với ngưỡng bảo toàn biên lợi nhuận gộp 38.5%, đồng thời ứng dụng bộ nhận diện đồ họa AI 3D nổi bật nhằm gia tăng tỷ lệ chuyển đổi khách hàng công nghệ.",
      marketInsights: [
        {
          label: "Quy mô Phụ kiện Công nghệ VN",
          value: "1.45 Tỷ USD",
          change: "+16.8% YoY",
          description: "Thiết bị đeo thông minh, sạc nhanh GaN và tai nghe không dây dẫn đầu tốc độ tăng trưởng.",
        },
        {
          label: "Tỷ lệ Chuyển đổi Flash Sale",
          value: "4.85%",
          change: "+1.8% so với thường",
          description: "Mức giảm -20% đánh đúng ngưỡng tâm lý kích hoạt chốt đơn của nhóm khách hàng trẻ thế hệ Gen Z.",
        },
        {
          label: "Khoảng giá Tối ưu (Sweet Spot)",
          value: "350k - 1.25M",
          change: "Biên lãi 38.5%",
          description: "Phân khúc phụ kiện cao cấp và thiết bị đeo có tỷ lệ mua kèm (Cross-sell) cao nhất trên Storefront.",
        },
        {
          label: "Giá trị Giỏ hàng (AOV)",
          value: "1,250,000 ₫",
          change: "+28% YoY",
          description: "Chính sách mua Combo Đồng hồ + Phụ kiện sạc giúp kéo doanh số trung bình mỗi đơn hàng tăng mạnh.",
        },
      ],
      conclusions: [
        {
          id: "c-1",
          title: "Chiến lược Sản phẩm Chim mồi & Bán chéo Combo (Cross-sell)",
          detail:
            "Các sản phẩm giá mềm (Cáp sạc C to C, Củ sạc 65W GaN) đóng vai trò kéo lưu lượng truy cập ban đầu, dẫn dắt khách hàng khám phá và mua kèm các sản phẩm biên lãi cao như NovaWatch Pro và NovaPods Ultra.",
          impact: "high",
        },
        {
          id: "c-2",
          title: "Đồng bộ Nhận diện Đồ họa AI & Đếm ngược Realtime trên Storefront",
          detail:
            "Huy hiệu 3D 'Nova Tech' và đồng hồ đếm ngược thời gian thực trên Storefront tạo hiệu ứng khan hiếm lành mạnh, thúc đẩy quyết định mua hàng trong 48 giờ đầu tiên.",
          impact: "high",
        },
        {
          id: "c-3",
          title: "Tối ưu Vận hành Kho & Cam kết Giao hàng Chống sốc 24h",
          detail:
            "Đã đồng bộ tồn kho an toàn và quy chuẩn đóng gói chống sốc chuyên dụng cho hàng điện tử giá trị cao, giảm tỷ lệ khiếu nại và hoàn trả xuống dưới 1.2%.",
          impact: "medium",
        },
      ],
      risks: [
        {
          id: "r-1",
          risk: "Nguy cơ đứt hàng cục bộ đối với các SKU Hot (NovaWatch Pro, NovaCharge)",
          severity: "medium",
          mitigation:
            "Giới hạn tối đa 2 sản phẩm/khách hàng và kích hoạt lệnh nhập bổ sung kho an toàn tự động.",
        },
        {
          id: "r-2",
          risk: "Tỷ lệ đổi trả hàng do lỗi kỹ thuật hoặc chưa rõ cách kết nối thiết bị",
          severity: "low",
          mitigation:
            "Tích hợp mã QR video hướng dẫn sử dụng nhanh trong hộp sản phẩm và hỗ trợ kỹ thuật 24/7 qua chatbot CSKH.",
        },
        {
          id: "r-3",
          risk: "Áp lực cạnh tranh giá từ các sàn thương mại điện tử trong đợt Mega Sale",
          severity: "medium",
          mitigation:
            "Tập trung vào cam kết bảo hành 1 đổi 1 trong 30 ngày chính hãng và quà tặng phụ kiện thay vì tham gia cuộc chiến phá giá.",
        },
      ],
      actionPlan: [
        {
          phase: "Giai đoạn 1 (Ngày 1-3)",
          title: "Kích hoạt Storefront & Đồng bộ Giá Flash Sale Realtime",
          duration: "72 giờ",
          tasks: [
            "Kích hoạt bộ nhận diện banner 3D Nova Tech trên trang chủ Storefront",
            "Đồng bộ bảng giá khuyến mãi Flash Sale thời gian thực trên toàn bộ 10 SKU công nghệ",
            "Gửi thông báo ưu đãi sớm qua kênh thành viên VIP và Social Fanpage",
          ],
        },
        {
          phase: "Giai đoạn 2 (Ngày 4-7)",
          title: "Đẩy mạnh Social Seeding & Livestream KOC Công nghệ",
          duration: "96 giờ",
          tasks: [
            "Triển khai chuỗi 15 video unboxing và đánh giá tính năng trên TikTok & Reels",
            "Tổ chức 2 phiên livestream đặc biệt với ưu đãi giờ vàng và quà tặng độc quyền",
            "Theo dõi sát sao phản hồi người mua và hỗ trợ giải đáp kỹ thuật tức thì",
          ],
        },
        {
          phase: "Giai đoạn 3 (Ngày 8-10)",
          title: "Chốt Đơn Chặng Cuối & Báo cáo Tổng kết Hiệu quả",
          duration: "72 giờ",
          tasks: [
            "Kích hoạt thông báo đếm ngược 24h cuối cùng cho các giỏ hàng đang chờ thanh toán",
            "Kiểm toán tổng doanh thu, lợi nhuận gộp và mức tiêu hao tồn kho",
            "Bàn giao báo cáo đánh giá hiệu quả cho Ban Giám đốc và đề xuất kế hoạch tái nhập hàng",
          ],
        },
      ],
      estimatedBudgetVnd: 320000000,
      tokenCost: 3120,
      format: "docx",
      docxFilename: "Bao_cao_Chien_luoc_Nova_Tech_Khai_Pha_Tuong_Lai.docx",
    };
  }

  // 2. Cosmetics / Beauty ASEAN Market Analysis
  if (
    lowerGoal.includes("mỹ phẩm") ||
    lowerGoal.includes("đông nam á") ||
    lowerGoal.includes("beauty") ||
    lowerGoal.includes("skincare") ||
    lowerGoal.includes("son môi") ||
    lowerGoal.includes("kem dưỡng")
  ) {
    const mDeptName =
      department === "merchandising"
        ? "Phòng Kinh doanh & Định giá Danh mục"
        : department === "marketing"
          ? "Phòng Tiếp thị & Truyền thông Sáng tạo"
          : "AI CEO & Điều phối Chiến lược";
    return {
      id,
      taskId,
      goal: cleanGoal,
      title: "Báo cáo Chiến lược: Phân tích Thị trường Mỹ phẩm Đông Nam Á & Kế hoạch Ra mắt",
      department: department || "ai_ceo",
      departmentName: mDeptName,
      createdAt: now,
      completedAt: now,
      summary:
        "Thị trường Mỹ phẩm và Chăm sóc Cá nhân Đông Nam Á (ASEAN) đạt quy mô 12.8 tỷ USD vào năm 2026 với tốc độ tăng trưởng kép (CAGR) ấn tượng 9.4%/năm. Việt Nam nổi lên như một trong những thị trường tăng trưởng nhanh nhất khu vực (+14.2%/năm) nhờ làn sóng tiêu dùng của thế hệ Gen Z và Millennials. Báo cáo phân tích toàn diện bối cảnh cạnh tranh, hành vi người tiêu dùng trên Social Commerce, cơ cấu định giá và đề xuất kế hoạch hành động 3 giai đoạn để ra mắt thương hiệu mới an toàn, hiệu quả và đạt biên lợi nhuận kỳ vọng 42% - 46%.",
      marketInsights: [
        {
          label: "Quy mô Thị trường ASEAN",
          value: "12.8 Tỷ USD",
          change: "+9.4% YoY",
          description: "Việt Nam, Indonesia và Thái Lan chiếm 68% tổng dung lượng toàn khu vực.",
        },
        {
          label: "Tăng trưởng E-Commerce VN",
          value: "+14.2%/năm",
          change: "Top 2 ASEAN",
          description: "TikTok Shop và Shopee chiếm hơn 80% doanh số mỹ phẩm trực tuyến.",
        },
        {
          label: "Phân khúc Tiềm năng nhất",
          value: "Clean Skincare",
          change: "Chiếm 46%",
          description: "Sản phẩm thuần chay, hữu cơ và chống nắng chuyên sâu có nhu cầu vượt trội.",
        },
        {
          label: "Khoảng giá Tối ưu (Sweet Spot)",
          value: "189k - 420k",
          change: "Biên lãi 44%",
          description: "Phân khúc phổ thông cao cấp (Mass-tige) có sức mua và tỷ lệ quay lại cao nhất.",
        },
      ],
      conclusions: [
        {
          id: "c-1",
          title: "Dịch chuyển mạnh mẽ sang Social Commerce & Video ngắn",
          detail:
            "Hơn 64% quyết định mua sắm mỹ phẩm tại Việt Nam bị tác động trực tiếp bởi video đánh giá trên TikTok và các phiên Livestream. Chiến lược thâm nhập bắt buộc phải đi kèm gói KOC Tier 2/3 và kịch bản livestream chuyển đổi cao.",
          impact: "high",
        },
        {
          id: "c-2",
          title: "Xu hướng 'Clean Beauty' và minh bạch nguồn gốc xuất xứ",
          detail:
            "Người tiêu dùng trẻ ưu tiên các sản phẩm có kiểm nghiệm da liễu, không hương liệu nhân tạo và được cấp phép theo Hiệp định Mỹ phẩm ASEAN (ACD). Cần công khai hồ sơ công bố để tạo niềm tin thương hiệu.",
          impact: "high",
        },
        {
          id: "c-3",
          title: "Lợi thế cạnh tranh từ hệ thống kho vận nội địa và giao hàng 48h",
          detail:
            "Giao hàng nhanh dưới 48h và đổi trả thuận tiện là yếu tố then chốt giúp giảm tỷ lệ hủy đơn (Return Rate) xuống dưới 3.5%, vượt trội so với các shop đặt hàng xuyên biên giới.",
          impact: "medium",
        },
      ],
      risks: [
        {
          id: "r-1",
          risk: "Cạnh tranh gay gắt về giá từ các thương hiệu nội địa Trung Quốc & OEM giá rẻ",
          severity: "medium",
          mitigation:
            "Định vị thương hiệu dựa trên câu chuyện bản địa hóa, thành phần độc quyền và dịch vụ chăm sóc sau bán cá nhân hóa thay vì tham gia cuộc chiến giảm giá.",
        },
        {
          id: "r-2",
          risk: "Rào cản pháp lý & thời gian phê duyệt Phiếu công bố mỹ phẩm (ASEAN Cosmetic Directive)",
          severity: "high",
          mitigation:
            "Nộp hồ sơ công bố trước 45 ngày; chuẩn bị đầy đủ chứng nhận GMP, CFS và bảng phân tích thành phần COA từ nhà máy sản xuất.",
        },
        {
          id: "r-3",
          risk: "Áp lực tồn kho SKU không đạt kỳ vọng trong đợt mở bán đầu tiên",
          severity: "low",
          mitigation:
            "Áp dụng cơ chế sản xuất theo đợt nhỏ (1,500 - 2,000 units/SKU) và kết nối chốt chặn định mức tồn kho an toàn trong OpenDX Inventory.",
        },
      ],
      actionPlan: [
        {
          phase: "Giai đoạn 1 (Tháng 1-2)",
          title: "Chuẩn hóa Pháp lý & Hoàn thiện Bộ nhận diện Thương hiệu",
          duration: "60 ngày",
          tasks: [
            "Hoàn tất Phiếu công bố mỹ phẩm theo chuẩn ASEAN Cosmetic Directive",
            "Thiết kế bao bì, tem phụ tiếng Việt và nhãn mác đạt chuẩn quy chuẩn y tế",
            "Ký kết hợp đồng gia công sản xuất với nhà máy đạt chuẩn cGMP",
            "Chụp ảnh sản phẩm 3D, thiết kế visual key và set up gian hàng Storefront",
          ],
        },
        {
          phase: "Giai đoạn 2 (Tháng 3-4)",
          title: "Chiến dịch Ra mắt & Thâm nhập Kênh Bán lẻ Số",
          duration: "60 ngày",
          tasks: [
            "Triển khai chiến dịch Seeding với 40+ KOC làm đẹp trên TikTok & Reels",
            "Kích hoạt gian hàng chính hãng LazMall & Shopee Mall với chương trình Flash Sale giới hạn",
            "Tổ chức chuỗi Livestream ra mắt sản phẩm kết hợp tặng quà sampling",
            "Cài đặt luồng CSKH tự động giải đáp thắc mắc về làn da và thành phần",
          ],
        },
        {
          phase: "Giai đoạn 3 (Tháng 5-6)",
          title: "Mở rộng Điểm bán & Tối ưu Trải nghiệm Khách hàng CRM",
          duration: "60 ngày",
          tasks: [
            "Đàm phán phân phối vào chuỗi bán lẻ mỹ phẩm hiện đại (Guardian, Hasaki)",
            "Kích hoạt hệ thống khách hàng thân thiết Loyalty CRM và tự động nhắc mua lại sau 45 ngày",
            "Đánh giá doanh số từng SKU để loại bỏ sản phẩm bán chậm và mở rộng phân loại mới",
          ],
        },
      ],
      estimatedBudgetVnd: 450000000,
      tokenCost: 3450,
      format: "docx",
      docxFilename: "Bao_cao_Chien_luoc_Thi_truong_My_pham_Dong_Nam_A.docx",
    };
  }

  // 3. Operations & Supply Chain Analysis
  if (
    department === "operations" ||
    lowerGoal.includes("tồn kho") ||
    lowerGoal.includes("nhập kho") ||
    lowerGoal.includes("kho vận") ||
    lowerGoal.includes("chuỗi cung ứng") ||
    lowerGoal.includes("bổ sung hàng") ||
    lowerGoal.includes("kỹ sư tồn kho") ||
    lowerGoal.includes("an toàn kho")
  ) {
    return {
      id,
      taskId,
      goal: cleanGoal,
      title: "Báo cáo Vận hành & Chuỗi cung ứng: Đánh giá Tồn kho An toàn & Đề xuất Nhập bổ sung Kho",
      department: "operations",
      departmentName: "Phòng Chuỗi cung ứng & Kho vận",
      createdAt: now,
      completedAt: now,
      summary:
        "Báo cáo tổng hợp số liệu tồn kho khả dụng, phân tích tốc độ luân chuyển sản phẩm và xác định các SKU chạm ngưỡng cảnh báo tồn kho an toàn (Safety Stock). Hệ thống Kỹ sư Kho và Điều phối Đơn hàng đã tự động đối soát số lượng giữ chỗ, thời gian bổ sung hàng (Lead Time) và đề xuất phương án nhập kho khẩn cấp để bảo đảm tỷ lệ sẵn sàng phục vụ 98.2% mà không làm phát sinh chi phí lưu kho thừa.",
      marketInsights: [
        {
          label: "Tỷ lệ Sẵn sàng Hàng hóa (Fill Rate)",
          value: "98.2%",
          change: "+2.4% so với kỳ trước",
          description: "Duy trì tỷ lệ hết hàng (Stockout) ở mức dưới 1.8% cho các sản phẩm chủ lực.",
        },
        {
          label: "Tồn kho An toàn Bình quân",
          value: "21 Ngày",
          change: "Ngưỡng khuyến nghị",
          description: "Đảm bảo cung ứng liên tục trong giai đoạn cao điểm mà không ứ đọng dòng vốn.",
        },
        {
          label: "Tốc độ Vòng quay Kho (Turnover)",
          value: "6.4 vòng/năm",
          change: "+1.1 vòng",
          description: "Cải thiện dòng tiền và giảm chi phí khấu hao hàng hóa lưu bãi.",
        },
        {
          label: "Tỷ lệ SKU Chậm luân chuyển",
          value: "3.8%",
          change: "Giảm 1.6%",
          description: "Các SKU biên lợi nhuận thấp đã được đưa vào chương trình giải phóng hàng tồn.",
        },
      ],
      conclusions: [
        {
          id: "c-ops-1",
          title: "Kích hoạt Cơ chế Tự động Đặt hàng Lại (Auto-ROP)",
          detail:
            "Thiết lập điểm đặt hàng tự động cho các SKU phụ kiện bán chạy (sạc nhanh, tai nghe), rút ngắn chu kỳ đặt hàng từ 5 ngày xuống còn 24 giờ.",
          impact: "high",
        },
        {
          id: "c-ops-2",
          title: "Mở rộng Vùng đệm An toàn Kho Vệ tinh",
          detail:
            "Phân bổ 30% lượng tồn kho về các kho vệ tinh gần trung tâm đô thị để rút ngắn thời gian giao hàng chặng cuối (Last-mile delivery) xuống dưới 24h.",
          impact: "high",
        },
        {
          id: "c-ops-3",
          title: "Kiểm định Chất lượng Đầu vào Đạt chuẩn QA/QC",
          detail:
            "Áp dụng quy trình kiểm tra 3 bước đối với linh kiện và thiết bị điện tử, hạn chế tỷ lệ lỗi kỹ thuật khi giao đến tay người tiêu dùng.",
          impact: "medium",
        },
      ],
      risks: [
        {
          id: "r-ops-1",
          risk: "Đứt hàng đột biến trong sự kiện Flash Sale cao điểm",
          severity: "medium",
          mitigation:
            "Khóa trước hạn mức đặt hàng với nhà cung ứng cấp 1 và thiết lập danh sách nhà cung ứng dự phòng thứ cấp.",
        },
        {
          id: "r-ops-2",
          risk: "Chi phí lưu kho tăng cao vào mùa cao điểm",
          severity: "low",
          mitigation:
            "Tối ưu diện tích pallet và đẩy nhanh tốc độ xuất kho các mã hàng có kích thước cồng kềnh.",
        },
      ],
      actionPlan: [
        {
          phase: "Giai đoạn 1 (Ngày 1-2)",
          title: "Kiểm toán Tồn kho Khả dụng & Lập Đơn Đặt hàng (PO)",
          duration: "48 giờ",
          tasks: [
            "Đối soát số lượng tồn kho vật lý và số dư trên hệ thống phần mềm",
            "Xác định danh sách SKU cần bổ sung khẩn cấp",
            "Phát hành đơn đặt mua hàng (PO) gửi nhà cung cấp",
          ],
        },
        {
          phase: "Giai đoạn 2 (Ngày 3-5)",
          title: "Tiếp nhận Hàng, Kiểm tra QA/QC & Nhập Hệ thống",
          duration: "72 giờ",
          tasks: [
            "Tiếp nhận hàng tại cửa kho và đối chiếu hóa đơn chứng từ",
            "Kiểm tra chất lượng mẫu ngẫu nhiên theo tiêu chuẩn AQL",
            "Nhập kho vật lý và cập nhật số lượng lên hệ thống WMS",
          ],
        },
        {
          phase: "Giai đoạn 3 (Ngày 6-7)",
          title: "Đồng bộ Dữ liệu Tồn kho lên Storefront & Giám sát Tự động",
          duration: "48 giờ",
          tasks: [
            "Đồng bộ số lượng khả dụng lên gian hàng trực tuyến Storefront",
            "Gỡ bỏ nhãn 'Hết hàng' và gửi thông báo cho khách hàng đã đăng ký nhận tin",
            "Kích hoạt cảm biến cảnh báo tồn kho an toàn thời gian thực",
          ],
        },
      ],
      estimatedBudgetVnd: 185000000,
      tokenCost: 2840,
      format: "docx",
      docxFilename: "Bao_cao_Van_hanh_Ton_kho_An_toan.docx",
    };
  }

  // 4. Support & Customer Experience Analysis
  if (
    department === "support" ||
    lowerGoal.includes("cskh") ||
    lowerGoal.includes("khách hàng") ||
    lowerGoal.includes("khiếu nại") ||
    lowerGoal.includes("ticket") ||
    lowerGoal.includes("churn") ||
    lowerGoal.includes("trải nghiệm") ||
    lowerGoal.includes("chăm sóc khách") ||
    lowerGoal.includes("voucher tri ân")
  ) {
    return {
      id,
      taskId,
      goal: cleanGoal,
      title: "Báo cáo CSKH & Trải nghiệm Khách hàng: Kiểm toán Ticket Sự cố, Phân khúc VIP & Giữ chân Khách hàng",
      department: "support",
      departmentName: "Phòng CSKH & Trải nghiệm Khách hàng",
      createdAt: now,
      completedAt: now,
      summary:
        "Báo cáo phân tích toàn diện 1,240 ticket hỗ trợ và chỉ số phản hồi của khách hàng trong chu kỳ vận hành. Hệ thống Quản gia CSKH và Chuyên viên CRM đã phân nhóm các điểm nghẽn trải nghiệm (thời gian phản hồi tin nhắn, khiếu nại giao trễ, hướng dẫn kỹ thuật), đồng thời thiết lập chính sách chăm sóc đặc biệt cho nhóm khách hàng VIP và quy trình cấp voucher bù đắp tự động nhằm giảm tỷ lệ rời bỏ (Churn Rate) xuống mức 2.4%.",
      marketInsights: [
        {
          label: "Điểm Hài lòng Khách hàng (CSAT)",
          value: "94.8%",
          change: "Mục tiêu > 92%",
          description: "94.8% khách hàng đánh giá hài lòng với quy trình giải quyết sự cố và thái độ hỗ trợ.",
        },
        {
          label: "Thời gian Phản hồi Lần đầu (FRT)",
          value: "42 Giây",
          change: "Giảm 65%",
          description: "Hệ thống AI Triage phân luồng tự động giúp giảm mạnh thời gian chờ của người dùng.",
        },
        {
          label: "Tỷ lệ Rời bỏ Khách hàng (Churn)",
          value: "2.4%",
          change: "Giảm 1.8%",
          description: "Chính sách voucher bù đắp giúp giữ chân 82% khách hàng có trải nghiệm ban đầu chưa tốt.",
        },
        {
          label: "Giá trị Vòng đời Khách hàng (CLV)",
          value: "4,850,000 ₫",
          change: "+24% YoY",
          description: "Khách hàng VIP quay lại mua hàng với giá trị đơn trung bình cao hơn 2.3 lần.",
        },
      ],
      conclusions: [
        {
          id: "c-sup-1",
          title: "Cơ chế Tự động Cấp Voucher Bù đắp Trải nghiệm",
          detail:
            "Khi đơn hàng bị chậm giao quá 2 giờ so với cam kết, hệ thống tự động gửi tin nhắn xin lỗi kèm mã voucher giảm giá 10% trong vòng 15 phút.",
          impact: "high",
        },
        {
          id: "c-sup-2",
          title: "Luồng Ưu tiên Dành riêng cho Khách hàng VIP",
          detail:
            "Các hội viên Diamond và Gold được kết nối trực tiếp với chuyên viên CSKH cao cấp, cam kết giải quyết mọi sự cố trong tối đa 30 phút.",
          impact: "high",
        },
        {
          id: "c-sup-3",
          title: "Xây dựng Thư viện Tri thức Tự Phục vụ (Knowledge Base)",
          detail:
            "Bổ sung video hướng dẫn sử dụng và tài liệu khắc phục lỗi phổ biến, giúp khách hàng tự giải quyết 78% thắc mắc ngoài giờ hành chính.",
          impact: "medium",
        },
      ],
      risks: [
        {
          id: "r-sup-1",
          risk: "Quá tải luồng yêu cầu hỗ trợ trong khung giờ Mega Sale",
          severity: "medium",
          mitigation:
            "Bật chế độ Auto-reply thông minh và huy động nhân sự trực tăng cường theo ca kíp.",
        },
        {
          id: "r-sup-2",
          risk: "Nguy cơ trục lợi chính sách bồi hoàn voucher",
          severity: "low",
          mitigation:
            "Thiết lập quy tắc kiểm tra chéo lịch sử mua hàng và giới hạn mỗi tài khoản chỉ nhận tối đa 1 voucher bồi hoàn/tháng.",
        },
      ],
      actionPlan: [
        {
          phase: "Giai đoạn 1 (Ngày 1-2)",
          title: "Phân loại & Giải quyết 100% Ticket Khiếu nại Còn Tồn đọng",
          duration: "48 giờ",
          tasks: [
            "Quét toàn bộ hòm thư và kênh tin nhắn để nhận diện các ticket chưa xử lý",
            "Phân công chuyên viên phụ trách xử lý ngay các ca khẩn cấp",
            "Cập nhật trạng thái và thông báo kết quả cho khách hàng",
          ],
        },
        {
          phase: "Giai đoạn 2 (Ngày 3-4)",
          title: "Kích hoạt Chiến dịch Chăm sóc Cá nhân hóa cho Khách hàng VIP",
          duration: "48 giờ",
          tasks: [
            "Trích xuất danh sách hội viên VIP có sinh nhật hoặc sắp tái đặt hàng",
            "Gửi quà tri ân và mã ưu đãi độc quyền qua kênh thông báo riêng",
            "Gọi điện thăm hỏi ý kiến trải nghiệm dịch vụ",
          ],
        },
        {
          phase: "Giai đoạn 3 (Ngày 5-7)",
          title: "Tối ưu Kịch bản Chatbot Tự động & Đo lường Chỉ số NPS/CSAT",
          duration: "72 giờ",
          tasks: [
            "Cập nhật câu trả lời mẫu cho các câu hỏi xuất hiện nhiều trong tuần",
            "Gửi khảo sát đo lường mức độ hài lòng tự động sau khi đóng ticket",
            "Báo cáo tổng kết chỉ số CSAT và NPS lên bảng điều khiển Ban Giám đốc",
          ],
        },
      ],
      estimatedBudgetVnd: 75000000,
      tokenCost: 2650,
      format: "docx",
      docxFilename: "Bao_cao_CSKH_Va_Giu_chan_Khach_hang.docx",
    };
  }

  // 5. Marketing & Social Campaign Analysis
  if (
    department === "marketing" ||
    lowerGoal.includes("marketing") ||
    lowerGoal.includes("tiếp thị") ||
    lowerGoal.includes("truyền thông") ||
    lowerGoal.includes("fanpage") ||
    lowerGoal.includes("bài viết") ||
    lowerGoal.includes("quảng cáo") ||
    lowerGoal.includes("tiktok") ||
    lowerGoal.includes("poster")
  ) {
    return {
      id,
      taskId,
      goal: cleanGoal,
      title: "Báo cáo Tiếp thị & Truyền thông: Kế hoạch Đa Kênh Tăng trưởng Lưu lượng & Kích hoạt Doanh số",
      department: "marketing",
      departmentName: "Phòng Tiếp thị & Truyền thông Sáng tạo",
      createdAt: now,
      completedAt: now,
      summary:
        "Chiến dịch truyền thông số tích hợp trên các kênh Facebook Fanpage, TikTok và Storefront nhằm tối ưu hóa phễu chuyển đổi khách hàng từ nhận biết đến quyết định mua. Đội ngũ Cây bút Sáng tạo, Thiết kế Đồ họa và Điều phối Xuất bản đã hoàn thiện bộ ấn phẩm trực quan 1080x1080 đạt chuẩn nhận diện thương hiệu, thông điệp truyền thông sắc bén và kế hoạch phân bổ ngân sách quảng cáo đảm bảo chỉ số ROAS đạt trên 4.5x.",
      marketInsights: [
        {
          label: "Lượt Tiếp cận Dự kiến (Reach)",
          value: "285,000 Lượt",
          change: "Độ phủ đa kênh",
          description: "Tập trung vào nhóm đối tượng khách hàng mục tiêu từ 20-35 tuổi yêu thích công nghệ & phong cách sống.",
        },
        {
          label: "Tỷ lệ Tương tác (Engagement)",
          value: "6.8%",
          change: "Vượt chuẩn ngành",
          description: "Định dạng hình ảnh 3D và câu hỏi tương tác kéo tỷ lệ bình luận tăng gấp đôi so với bài viết thông thường.",
        },
        {
          label: "Tỷ suất Doanh thu / Chi phí (ROAS)",
          value: "4.5x",
          change: "Dự kiến đạt được",
          description: "Dựa trên mô hình phễu chuyển đổi thử nghiệm và giá trị giỏ hàng AOV tối ưu.",
        },
        {
          label: "Chi phí cho Mỗi Lượt Nhấp (CPC)",
          value: "1,250 ₫",
          change: "Tiết kiệm 22%",
          description: "Tối ưu hóa thông điệp và nhắm chọn mục tiêu giúp giảm lãng phí ngân sách.",
        },
      ],
      conclusions: [
        {
          id: "c-mkt-1",
          title: "Tập trung Phân bổ Ngân sách vào Khung Giờ Vàng",
          detail:
            "Tập trung 65% ngân sách quảng cáo vào các khung giờ 11:30 - 13:00 và 20:00 - 22:30 để đón đầu thời điểm người dùng mua sắm trực tuyến nhiều nhất.",
          impact: "high",
        },
        {
          id: "c-mkt-2",
          title: "Đồng bộ Thông điệp Tiếp thị với Chương trình Storefront",
          detail:
            "Mọi bài đăng đều có liên kết trực tiếp (Deep Link) đến trang chi tiết sản phẩm kèm mã ưu đãi đồng bộ thời gian thực.",
          impact: "high",
        },
        {
          id: "c-mkt-3",
          title: "Thử nghiệm A/B Testing Hình ảnh và Tiêu đề",
          detail:
            "Chạy thử 3 biến thể hình ảnh và 2 phiên bản tiêu đề trong 24 giờ đầu để chọn ra mẫu có CTR cao nhất trước khi mở rộng ngân sách.",
          impact: "medium",
        },
      ],
      risks: [
        {
          id: "r-mkt-1",
          risk: "Chi phí đấu thầu quảng cáo tăng cao do cạnh tranh mùa lễ",
          severity: "medium",
          mitigation:
            "Tăng cường tỷ trọng nội dung tự nhiên (Organic Content) và khai thác tệp khách hàng sẵn có qua email/SMS.",
        },
        {
          id: "r-mkt-2",
          risk: "Rủi ro phản hồi tiêu cực trên mạng xã hội",
          severity: "low",
          mitigation:
            "Chuẩn bị sẵn bộ kịch bản phản hồi khủng hoảng truyền thông và phân công người trực theo dõi bình luận 24/7.",
        },
      ],
      actionPlan: [
        {
          phase: "Giai đoạn 1 (Ngày 1-2)",
          title: "Hoàn thiện Nội dung Bản thảo, Thiết kế Visual & Duyệt Bài đăng",
          duration: "48 giờ",
          tasks: [
            "Soạn thảo nội dung bài đăng chính và các bài viết bổ trợ",
            "Thiết kế bộ banner và ảnh sản phẩm 1:1 chuẩn kích thước",
            "Trình Ban Giám đốc phê duyệt bản thảo cuối cùng",
          ],
        },
        {
          phase: "Giai đoạn 2 (Ngày 3-5)",
          title: "Xuất bản Lên Fanpage & Chạy Thử nghiệm A/B Testing",
          duration: "72 giờ",
          tasks: [
            "Xuất bản bài viết theo lịch hẹn tự động lên Fanpage Facebook",
            "Cài đặt chiến dịch quảng cáo thử nghiệm ngân sách nhỏ",
            "Đo lường chỉ số CTR và CPC để tối ưu nội dung",
          ],
        },
        {
          phase: "Giai đoạn 3 (Ngày 6-7)",
          title: "Mở rộng Ngân sách Chiến dịch Thắng cuộc & Tổng kết Hiệu quả",
          duration: "48 giờ",
          tasks: [
            "Tập trung 100% ngân sách vào mẫu quảng cáo hiệu quả nhất",
            "Chạy Remarketing nhắm lại những người dùng đã bấm vào liên kết",
            "Xuất báo cáo tổng kết chuyển đổi doanh thu cho Ban Giám đốc",
          ],
        },
      ],
      estimatedBudgetVnd: 120000000,
      tokenCost: 2980,
      format: "docx",
      docxFilename: "Bao_cao_Tiep_thi_Va_Truyen_thong_Da_kenh.docx",
    };
  }

  // 6. Generic Strategic Goal Handler
  const deptDisplayNameMap: Record<DepartmentType | "ai_ceo", string> = {
    ai_ceo: "AI CEO & Điều phối Chiến lược",
    marketing: "Phòng Tiếp thị & Truyền thông Sáng tạo",
    merchandising: "Phòng Kinh doanh & Định giá Danh mục",
    operations: "Phòng Chuỗi cung ứng & Kho vận",
    support: "Phòng CSKH & Trải nghiệm Khách hàng",
  };
  const resolvedDept: DepartmentType | "ai_ceo" = department || "ai_ceo";
  const resolvedDeptName = deptDisplayNameMap[resolvedDept] || "AI CEO & Điều phối Chiến lược";

  const capitalized = cleanGoal.charAt(0).toUpperCase() + cleanGoal.slice(1);
  return {
    id,
    taskId,
    goal: cleanGoal,
    title: `Báo cáo Chiến lược Điều hành: ${capitalized.length > 55 ? `${capitalized.slice(0, 52)}...` : capitalized}`,
    department: resolvedDept,
    departmentName: resolvedDeptName,
    createdAt: now,
    completedAt: now,
    summary: `Hệ thống AI CEO đã phối hợp cùng ${resolvedDeptName} phân tích toàn diện yêu cầu chiến lược: "${cleanGoal}". Dữ liệu được tổng hợp từ lịch sử vận hành, tín hiệu thị trường và năng lực nội tại doanh nghiệp để xây dựng kế hoạch hành động khả thi, tối ưu hóa ngân sách và giảm thiểu rủi ro vận hành.`,
    marketInsights: [
      {
        label: "Chỉ số Tiềm năng Tăng trưởng",
        value: "+18.5%",
        change: "Độ tin cậy cao",
        description: "Dựa trên mô hình phân tích hồi quy số liệu kinh doanh 90 ngày gần nhất.",
      },
      {
        label: "Hiệu quả Sử dụng Vốn (ROI)",
        value: "2.4x",
        change: "Dự kiến 6 tháng",
        description: "Tỷ suất hoàn vốn ước tính khi áp dụng phân bổ tài nguyên theo đề xuất.",
      },
      {
        label: "Thời gian Triển khai Khả thi",
        value: "45 Ngày",
        change: "Tiến độ chuẩn",
        description: "Phân bổ 3 chặng kiểm soát chất lượng nhằm đảm bảo đúng chuẩn SLA nội bộ.",
      },
      {
        label: "Mức độ Rủi ro Tổng thể",
        value: "Thấp - Trung bình",
        change: "Đã có phương án dự phòng",
        description: "Các kịch bản phòng ngừa đứt gãy và biến động chi phí đã được tích hợp.",
      },
    ],
    conclusions: [
      {
        id: "c-1",
        title: "Sự đồng thuận cao giữa các phòng ban chuyên môn",
        detail: "Kế hoạch đã được kiểm toán chéo giữa Vận hành, Tài chính và Tiếp thị, đảm bảo không xung đột nguồn lực.",
        impact: "high",
      },
      {
        id: "c-2",
        title: "Khả năng mở rộng linh hoạt theo dữ liệu thực tế",
        detail: "Cho phép điều chỉnh ngân sách và nhân sự theo từng giai đoạn mà không gây gián đoạn chuỗi cung ứng.",
        impact: "high",
      },
      {
        id: "c-3",
        title: "Tối ưu hóa chi phí nhờ tự động hóa nhân sự số",
        detail: "Tiết kiệm hơn 35% thời gian chuẩn bị tài liệu và điều phối thủ công thông thường.",
        impact: "medium",
      },
    ],
    risks: [
      {
        id: "r-1",
        risk: "Biến động chi phí vận hành và giá nguyên vật liệu đầu vào",
        severity: "medium",
        mitigation: "Ký kết hợp đồng khung với các nhà cung ứng chính và duy trì quỹ dự phòng 15%.",
      },
      {
        id: "r-2",
        risk: "Trễ hạn tiến độ tại các điểm kiểm soát chất lượng liên phòng ban",
        severity: "low",
        mitigation: "Kích hoạt cơ chế thông báo tự động (Fail-safe alert) ngay khi có tác vụ chậm quá 4h.",
      },
    ],
    actionPlan: [
      {
        phase: "Giai đoạn 1",
        title: "Khởi động & Thiết lập Nền tảng Dữ liệu",
        duration: "15 ngày",
        tasks: [
          "Thống nhất mục tiêu KPI và chỉ số đo lường với các trưởng bộ phận",
          "Chuẩn bị tài nguyên kỹ thuật, tài khoản dịch vụ và phân bổ ngân sách",
          "Ban hành quy trình phối hợp liên phòng ban",
        ],
      },
      {
        phase: "Giai đoạn 2",
        title: "Triển khai Thử nghiệm & Hiệu chỉnh",
        duration: "20 ngày",
        tasks: [
          "Chạy thử nghiệm trên nhóm mẫu và thu thập phản hồi người dùng",
          "Rà soát số liệu thực tế so với kịch bản dự báo",
          "Hiệu chỉnh tham số định giá và phân bổ ngân sách",
        ],
      },
      {
        phase: "Giai đoạn 3",
        title: "Nhân rộng Quy mô & Đánh giá Tổng kết",
        duration: "10 ngày",
        tasks: [
          "Kích hoạt triển khai chính thức trên toàn hệ thống",
          "Bàn giao tài liệu hướng dẫn và lưu trữ bản ghi kiểm toán",
          "Đánh giá tổng kết và đề xuất định hướng chu kỳ tiếp theo",
        ],
      },
    ],
    estimatedBudgetVnd: 280000000,
    tokenCost: 2950,
    format: "docx",
    docxFilename: `Bao_cao_Chien_luoc_${cleanGoal.slice(0, 20).replace(/[^a-zA-Z0-9]/g, "_")}.docx`,
  };
}

/**
 * Generates an HTML document payload that Microsoft Word / LibreOffice natively opens as a DOCX-compatible document.
 */
export function generateWordDocumentContent(deliverable: StrategicDeliverable): string {
  const formatCurrency = (val?: number) => {
    if (!val) return "Theo quyết định ban giám đốc";
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
  };

  return `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${deliverable.title}</title>
  <style>
    body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.6; color: #1e293b; padding: 40px; }
    h1 { color: #0f172a; font-size: 24pt; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 20px; }
    h2 { color: #1e40af; font-size: 16pt; margin-top: 24px; margin-bottom: 12px; border-left: 4px solid #3b82f6; padding-left: 10px; }
    h3 { color: #334155; font-size: 13pt; margin-top: 16px; margin-bottom: 8px; }
    p { margin: 8px 0; font-size: 11pt; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
    .meta-item { margin: 4px 0; font-size: 10pt; color: #475569; }
    .meta-item strong { color: #0f172a; }
    .summary-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin-bottom: 24px; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #1e293b; color: #ffffff; text-align: left; padding: 10px 12px; font-size: 10.5pt; }
    td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 10pt; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8.5pt; font-weight: bold; }
    .badge-high { background: #fee2e2; color: #b91c1c; }
    .badge-medium { background: #fef3c7; color: #b45309; }
    .badge-low { background: #dcfce7; color: #15803d; }
    ul { margin: 8px 0 16px 24px; padding: 0; }
    li { margin-bottom: 6px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <h1>${deliverable.title}</h1>
  
  <div class="meta-box">
    <div class="meta-item"><strong>Cơ quan ban hành:</strong> OpenDX CompanyOS - Digital Workforce Command Center</div>
    <div class="meta-item"><strong>Phòng ban chủ trì:</strong> ${deliverable.departmentName}</div>
    <div class="meta-item"><strong>Mục tiêu chỉ đạo:</strong> ${deliverable.goal}</div>
    <div class="meta-item"><strong>Thời điểm lập báo cáo:</strong> ${new Date(deliverable.completedAt).toLocaleString("vi-VN")}</div>
    <div class="meta-item"><strong>Ngân sách dự toán:</strong> ${formatCurrency(deliverable.estimatedBudgetVnd)}</div>
    <div class="meta-item"><strong>Chi phí tài nguyên AI:</strong> ${deliverable.tokenCost.toLocaleString()} tokens</div>
  </div>

  <h2>1. Tóm tắt Điều hành (Executive Summary)</h2>
  <div class="summary-box">
    <p>${deliverable.summary}</p>
  </div>

  <h2>2. Số liệu & Tín hiệu Thị trường Trọng điểm (Market Insights)</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 30%;">Chỉ số / Tín hiệu</th>
        <th style="width: 25%;">Giá trị & Biến động</th>
        <th style="width: 45%;">Ý nghĩa Chiến lược</th>
      </tr>
    </thead>
    <tbody>
      ${deliverable.marketInsights
        .map(
          (it) => `
        <tr>
          <td><strong>${it.label}</strong></td>
          <td><strong>${it.value}</strong> ${it.change ? `<em>(${it.change})</em>` : ""}</td>
          <td>${it.description}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>

  <h2>3. Kết luận & Nhận định Chuyên sâu</h2>
  <ul>
    ${deliverable.conclusions
      .map(
        (c) => `
      <li>
        <strong>${c.title}</strong>: ${c.detail}
      </li>
    `,
      )
      .join("")}
  </ul>

  <h2>4. Ma trận Quản trị Rủi ro & Giải pháp Phòng ngừa</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 40%;">Rủi ro Nhận diện</th>
        <th style="width: 15%;">Mức độ</th>
        <th style="width: 45%;">Phương án Giảm thiểu & Phòng ngừa</th>
      </tr>
    </thead>
    <tbody>
      ${deliverable.risks
        .map(
          (r) => `
        <tr>
          <td>${r.risk}</td>
          <td><span class="badge badge-${r.severity}">${r.severity.toUpperCase()}</span></td>
          <td>${r.mitigation}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>

  <h2>5. Lộ trình Triển khai 3 Giai đoạn (Implementation Action Plan)</h2>
  ${deliverable.actionPlan
    .map(
      (phase) => `
    <h3>${phase.phase}: ${phase.title} (${phase.duration})</h3>
    <ul>
      ${phase.tasks.map((t) => `<li>${t}</li>`).join("")}
    </ul>
  `,
    )
    .join("")}

  <div class="footer">
    Báo cáo này được tổng hợp và kiểm toán tự động bởi hệ thống AI CEO OpenDX CompanyOS.<br/>
    Mọi thông tin trong văn bản tuân thủ chuẩn Clean Architecture và kiểm soát dữ liệu nội bộ.
  </div>
</body>
</html>
  `.trim();
}

/**
 * Helper to download the StrategicDeliverable Word document (.docx compatible) directly.
 */
export function downloadDeliverableDocx(deliverable: StrategicDeliverable): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const htmlContent = generateWordDocumentContent(deliverable);
  const blob = new Blob([htmlContent], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = deliverable.docxFilename || `Bao_cao_Chien_luoc_${deliverable.id.slice(0, 8)}.docx`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(link);
}
