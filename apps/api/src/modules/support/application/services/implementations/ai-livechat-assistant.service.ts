// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

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
  constructor(private readonly config: AiLivechatAssistantConfig) {}

  public async generateReply(input: GenerateLivechatReplyInput): Promise<GenerateLivechatReplyResult> {
    const apiKey = this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    const model = this.config.openRouterModel || process.env.MARKETING_CONTENT_MODELS || "google/gemini-2.5-flash";

    if (!apiKey) {
      return this.fallbackReply(input);
    }

    try {
      const systemPrompt = `Bạn là Trợ lý AI CSKH trực tuyến chuyên nghiệp của NovaCommerce (OpenDX CompanyOS).
Nhiệm vụ của bạn là hỗ trợ khách hàng ngay lập tức qua Live Chat khi nhân viên tư vấn đang bận hoặc vào ngoài giờ hành chính.

Quy tắc phản hồi:
1. Giọng điệu thân thiện, chu đáo, đồng cảm và lịch sự (gọi khách hàng là "Quý khách" hoặc theo tên "${input.customerName}").
2. Câu trả lời ngắn gọn, súc tích (khoảng 2-4 câu, phù hợp giao diện Live Chat trên điện thoại và máy tính).
3. Hướng dẫn kỹ thuật cơ bản nếu liên quan đến sản phẩm (ví dụ: máy chơi game PS5 không lên hình HDMI -> gợi ý kiểm tra cắm chặt cổng HDMI 2.1, đổi cổng trên TV, khởi động lại giữ nút nguồn 7 giây vào Safe Mode).
4. Chính sách bảo hành: Đổi mới trong 7 ngày nếu lỗi phần cứng nhà sản xuất, bảo hành chính hãng 12 tháng.
5. Nếu khách hàng tỏ ra giận dữ, khiếu nại nghiêm trọng, báo hỏng thiết bị hoặc yêu cầu hoàn tiền:
   - Hãy trấn an khách hàng ngay.
   - Ghi nhận và thông báo rằng yêu cầu đã được đánh dấu ƯU TIÊN CAO và gửi trực tiếp tới Trưởng bộ phận Kỹ thuật.
6. BẮT BUỘC trả về duy nhất định dạng JSON thuần túy theo cấu trúc:
{
  "reply": "nội dung tin nhắn gửi khách hàng",
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
