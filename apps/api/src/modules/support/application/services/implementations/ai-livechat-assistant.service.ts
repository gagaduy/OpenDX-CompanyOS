// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";

export interface AiLivechatAssistantConfig {
  readonly openRouterApiKey?: string;
  readonly openRouterModel?: string;
  readonly openRouterBaseUrl?: string;
}

export interface GenerateLivechatReplyInput {
  readonly customerName: string;
  readonly customerEmail?: string;
  readonly currentMessage: string;
  readonly ticketSubject?: string;
  readonly history?: readonly { readonly authorId: string; readonly body: string }[];
}

export interface GenerateLivechatReplyResult {
  readonly reply: string;
  readonly isCritical: boolean;
  readonly category: "product_troubleshooting" | "order_inquiry" | "warranty_policy" | "general_inquiry";
}

export class AiLivechatAssistantService {
  constructor(
    private readonly config: AiLivechatAssistantConfig,
    private readonly database?: Pool,
  ) {}

  public async getCatalogProductsSummary(): Promise<string> {
    if (!this.database) return "";
    try {
      const res = await this.database.query<{
        id: string;
        name: string;
        slug: string;
        description: string;
        media_id: string;
        min_price: string | number | null;
      }>(
        `SELECT p.id, p.name, p.slug, p.description, pm.id as media_id,
                MIN(pp.amount_minor) as min_price
         FROM products p
         JOIN product_media pm ON pm.product_id = p.id AND pm.is_primary = true
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         LEFT JOIN product_prices pp ON pp.variant_id = pv.id AND pp.valid_to IS NULL
         WHERE p.status = 'published'
         GROUP BY p.id, p.name, p.slug, p.description, pm.id
         ORDER BY p.name ASC`,
      );

      if (res.rows.length === 0) return "";

      const items = res.rows.map((r) => {
        const priceStr = r.min_price
          ? `${Number(r.min_price).toLocaleString("vi-VN")} đ`
          : "Đang cập nhật";
        return `- Tên: ${r.name}
  Mô tả: ${r.description}
  Giá từ: ${priceStr}
  Link chi tiết: /products/${r.slug}
  Ảnh sản phẩm: /v1/storefront/products/${r.id}/media/${r.media_id}/content`;
      });

      return `\n\nDANH MỤC SẢN PHẨM HIỆN CÓ SẴN TẠI NOVACOMMERCE:\n${items.join("\n\n")}\n`;
    } catch (err) {
      console.error("[AiLivechatAssistantService] Error querying catalog products:", err);
      return "";
    }
  }

  public async generateReply(input: GenerateLivechatReplyInput): Promise<GenerateLivechatReplyResult> {
    const apiKey = this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    const model = this.config.openRouterModel || process.env.MARKETING_CONTENT_MODELS || "google/gemini-2.5-flash";

    if (!apiKey) {
      return this.fallbackReply(input);
    }

    try {
      const catalogSummary = await this.getCatalogProductsSummary();

      const systemPrompt = `Bạn là Trợ lý AI CSKH trực tuyến chuyên nghiệp của NovaCommerce (OpenDX CompanyOS).
Nhiệm vụ của bạn là hỗ trợ khách hàng ngay lập tức qua Live Chat khi nhân viên tư vấn đang bận hoặc ngoài giờ làm việc.
${catalogSummary}
Quy tắc phản hồi:
1. Giọng điệu thân thiện, chu đáo, đồng cảm và lịch sự (gọi khách hàng là "Quý khách" hoặc theo tên "${input.customerName}").
2. Câu trả lời ngắn gọn, súc tích (khoảng 2-4 câu, phù hợp giao diện Live Chat).
3. QUY TẮC ĐẶC BIỆT KHI KHÁCH HỎI XEM, TÌM HIỂU HOẶC XIN ẢNH SẢN PHẨM:
   - Nếu khách hàng muốn xem, hỏi mua hoặc xin ảnh về bất kỳ sản phẩm nào có trong danh mục cửa hàng ở trên (như laptop, điện thoại, bàn phím cơ, chuột, đồng hồ, máy tính bảng, ssd, card đồ họa...):
     a) Nhiệt tình giới thiệu tên sản phẩm, tóm tắt điểm nổi bật và giá bán.
     b) BẮT BUỘC chèn hình ảnh sản phẩm bằng cú pháp markdown:
        ![Tên sản phẩm](đường_dẫn_Ảnh_sản_phẩm)
     c) Kèm link xem chi tiết sản phẩm: [Xem chi tiết sản phẩm](link_chi_tiết)
   - Nếu sản phẩm KHÔNG có trong danh mục: Lịch sự thông báo shop hiện chưa có mặt hàng đó và gợi ý các sản phẩm sẵn có liên quan.
4. Hướng dẫn kỹ thuật cơ bản nếu liên quan đến sự cố (ví dụ: máy không lên hình HDMI -> gợi ý kiểm tra cắm chặt cổng HDMI 2.1, đổi cổng trên TV, khởi động lại giữ nút nguồn 7 giây vào Safe Mode).
5. Chính sách bảo hành: Đổi mới trong 7 ngày nếu lỗi phần cứng nhà sản xuất, bảo hành chính hãng 12 tháng.
6. Nếu khách hàng tỏ ra giận dữ, khiếu nại nghiêm trọng, báo hỏng thiết bị hoặc yêu cầu hoàn tiền:
   - Hãy trấn an khách hàng ngay.
   - Ghi nhận và thông báo rằng yêu cầu đã được đánh dấu ƯU TIÊN CAO và gửi trực tiếp tới Trưởng bộ phận Kỹ thuật.
7. BẮT BUỘC trả về duy nhất định dạng JSON thuần túy theo cấu trúc:
{
  "reply": "nội dung tin nhắn gửi khách hàng (bao gồm cú pháp markdown ảnh ![alt](url) nếu có sản phẩm phù hợp)",
  "isCritical": boolean,
  "category": "product_troubleshooting" | "order_inquiry" | "warranty_policy" | "general_inquiry"
}`;

      const historyFormatted = (input.history || [])
        .slice(-6)
        .map((m) => `${m.authorId === "customer" ? "Khách hàng" : "CSKH"}: ${m.body}`)
        .join("\n");

      const userPrompt = `Lịch sử hội thoại trước đó:\n${historyFormatted || "(Không có)"}\n\nTin nhắn mới nhất từ khách hàng (${input.customerName}): "${input.currentMessage}"\nTiêu đề yêu cầu: ${input.ticketSubject || "(Live Chat)"}`;

      const response = await fetch(
        this.config.openRouterBaseUrl || "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
          }),
        },
      );

      if (response.ok) {
        const json = (await response.json()) as any;
        const content = json.choices?.[0]?.message?.content?.trim() || "";
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed.reply) {
            return {
              reply: parsed.reply,
              isCritical: Boolean(parsed.isCritical),
              category: parsed.category || "general_inquiry",
            };
          }
        } catch {
          if (cleaned.length > 0) {
            return {
              reply: cleaned,
              isCritical: this.isCriticalText(cleaned + " " + input.currentMessage),
              category: "general_inquiry",
            };
          }
        }
      }
    } catch (err) {
      console.error("[AiLivechatAssistantService] OpenRouter call failed, using fallback:", err);
    }

    return this.fallbackReply(input);
  }

  private isCriticalText(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes("hỏng") ||
      lower.includes("lỗi") ||
      lower.includes("hoàn tiền") ||
      lower.includes("không nhận") ||
      lower.includes("cháy") ||
      lower.includes("nổ") ||
      lower.includes("bốc khói") ||
      lower.includes("lừa đảo")
    );
  }

  private fallbackReply(input: GenerateLivechatReplyInput): GenerateLivechatReplyResult {
    const text = input.currentMessage.toLowerCase();
    const isCritical = this.isCriticalText(text);

    // Check for product inquiry in fallback mode
    if (text.includes("bàn phím") || text.includes("keyboard") || text.includes("phím cơ")) {
      return {
        reply: `Dạ chào ${input.customerName}, NovaCommerce hiện có sẵn bàn phím cơ không dây **Nova Mechanical Keyboard** với switch bấm êm ái, giá chỉ từ 2.490.000 đ. Dưới đây là hình ảnh thực tế của sản phẩm ạ:\n\n![Nova Mechanical Keyboard](/v1/storefront/products/20000000-0000-4000-8000-000000000009/media/50000000-0000-4000-8000-000000000009/content)\n\nBạn có thể [Xem chi tiết sản phẩm](/products/mechanical-keyboard) để đặt hàng ngay nhé!`,
        isCritical: false,
        category: "general_inquiry",
      };
    }

    if (text.includes("chuột") || text.includes("mouse")) {
      return {
        reply: `Dạ chào ${input.customerName}, NovaCommerce có chuột không dây công thái học **Nova Wireless Mouse** cảm biến siêu nhạy, giá từ 1.290.000 đ. Hình ảnh sản phẩm gửi bạn tham khảo ạ:\n\n![Nova Wireless Mouse](/v1/storefront/products/20000000-0000-4000-8000-000000000010/media/50000000-0000-4000-8000-000000000010/content)\n\nChi tiết xem tại: [Xem chi tiết sản phẩm](/products/wireless-mouse) nhé!`,
        isCritical: false,
        category: "general_inquiry",
      };
    }

    if (text.includes("laptop") || text.includes("máy tính xách tay")) {
      return {
        reply: `Dạ chào ${input.customerName}, dòng máy **Nova Laptop Pro** hiệu năng vượt trội cho đồ họa và lập trình hiện có giá từ 32.990.000 đ. Mời bạn xem hình ảnh sản phẩm ạ:\n\n![Nova Laptop Pro](/v1/storefront/products/20000000-0000-4000-8000-000000000001/media/50000000-0000-4000-8000-000000000001/content)\n\nBạn có thể [Xem chi tiết sản phẩm](/products/laptop-pro) để nhận ưu đãi nhé!`,
        isCritical: false,
        category: "general_inquiry",
      };
    }

    if (text.includes("điện thoại") || text.includes("phone")) {
      return {
        reply: `Dạ chào ${input.customerName}, shop có sẵn **Nova Phone Pro** camera đỉnh cao và màn hình AMOLED sắc nét giá từ 22.990.000 đ. Dưới đây là hình ảnh máy ạ:\n\n![Nova Phone Pro](/v1/storefront/products/20000000-0000-4000-8000-000000000003/media/50000000-0000-4000-8000-000000000003/content)\n\nXem thêm chi tiết tại: [Xem chi tiết sản phẩm](/products/phone-pro).`,
        isCritical: false,
        category: "general_inquiry",
      };
    }

    if (text.includes("đồng hồ") || text.includes("watch") || text.includes("smart watch")) {
      return {
        reply: `Dạ chào ${input.customerName}, **Nova Smart Watch** theo dõi nhịp tim và hoạt động thể thao 24/7 giá chỉ 6.490.000 đ. Ảnh sản phẩm gửi bạn xem nhé:\n\n![Nova Smart Watch](/v1/storefront/products/20000000-0000-4000-8000-000000000006/media/50000000-0000-4000-8000-000000000006/content)\n\nBạn có thể [Xem chi tiết sản phẩm](/products/smart-watch) ạ!`,
        isCritical: false,
        category: "general_inquiry",
      };
    }

    if (text.includes("hdmi") || text.includes("màn hình")) {
      return {
        reply: `Dạ chào ${input.customerName}, NovaCommerce đã nhận thông tin. Với lỗi không nhận tín hiệu HDMI, bạn vui lòng thử rút cáp HDMI cắm lại chặt 2 đầu, đổi cổng HDMI khác trên TV hoặc giữ nút nguồn 7 giây để máy vào Safe Mode kiểm tra độ phân giải nhé. Nhân viên kỹ thuật đang kiểm tra và sẽ hỗ trợ thêm ngay ạ!`,
        isCritical: true,
        category: "product_troubleshooting",
      };
    }

    if (text.includes("bảo hành") || text.includes("đổi trả")) {
      return {
        reply: `Dạ chào ${input.customerName}, tất cả sản phẩm chính hãng tại NovaCommerce được bảo hành 12-24 tháng và hỗ trợ 1 đổi 1 trong 7 ngày nếu có lỗi từ nhà sản xuất. Bạn vui lòng cung cấp mã đơn hàng hoặc số điện thoại để shop tra cứu nhanh nhất nhé!`,
        isCritical: false,
        category: "warranty_policy",
      };
    }

    return {
      reply: `Dạ chào ${input.customerName}, cảm ơn bạn đã liên hệ NovaCommerce Support! Tin nhắn của bạn đã được chuyển tới chuyên viên tư vấn. Trong ít phút nữa nhân viên phụ trách sẽ phản hồi trực tiếp cho bạn nhé.`,
      isCritical,
      category: isCritical ? "product_troubleshooting" : "general_inquiry",
    };
  }
}
