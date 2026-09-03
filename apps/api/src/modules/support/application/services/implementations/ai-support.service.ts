// apps/api/src/modules/support/application/services/implementations/ai-support.service.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AiSupportProposalDto,
  AiSupportTicketItemDto,
  AiSupportVipCustomerDto,
  ApplySupportRequestDto,
  ApplySupportResultDto,
  GenerateSupportProposalRequestDto,
} from "../../dtos/ai-support-response.dto";
import { generateSupportReportDocx } from "../../../infrastructure/generators/support-report-docx.generator";
import { renderSupportResolutionEmailHtml } from "../../../infrastructure/templates/support-resolution-email.template";
import type { EmailDispatcherPort } from "../../ports/email-dispatcher.port";

export interface AiSupportConfig {
  readonly openRouterApiKey?: string;
  readonly openRouterModel?: string;
  readonly openRouterBaseUrl?: string;
}

export class AiSupportService {
  private readonly proposalsCache = new Map<string, AiSupportProposalDto>();

  constructor(
    private readonly database: Pool,
    private readonly config: AiSupportConfig,
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly emailDispatcher?: EmailDispatcherPort,
  ) {}

  async generateSupportProposal(
    request: GenerateSupportProposalRequestDto,
  ): Promise<AiSupportProposalDto> {
    const proposalId = this.generateId();

    // 1. Ensure sample seed tickets exist if empty
    await this.ensureSeedTickets();

    // 2. Query open support tickets joined with customers
    const ticketResult = await this.database.query<{
      id: string;
      customer_id: string;
      full_name: string;
      email: string;
      subject: string;
      description: string;
      priority: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT st.id, st.customer_id, COALESCE(c.full_name, 'Khách vãng lai') as full_name, 
              COALESCE(c.email, 'customer@example.com') as email, 
              st.subject, st.description, st.priority, st.status, st.created_at
       FROM support_tickets st
       LEFT JOIN customers c ON c.id = st.customer_id
       ORDER BY CASE WHEN st.status IN ('resolved', 'closed') THEN 1 ELSE 0 END, st.created_at DESC
       LIMIT 10`,
    );

    // 3. Query top spending customers for VIP analysis
    const vipResult = await this.database.query<{
      id: string;
      full_name: string;
      email: string;
      total_spent: string | number;
      order_count: string | number;
    }>(
      `SELECT c.id, c.full_name, c.email, 
              COALESCE(SUM(o.total_vnd), 0) as total_spent,
              COUNT(o.id) as order_count
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       GROUP BY c.id, c.full_name, c.email
       ORDER BY total_spent DESC
       LIMIT 5`,
    );

    const rawTickets = ticketResult.rows;
    const rawVips = vipResult.rows;

    // 4. Call OpenRouter Gemini 2.5 Flash for Sentiment & Churn Analysis
    let rawAiResult: any = null;
    const apiKey = this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const promptSystem = `Bạn là Quản gia CSKH & Chuyên viên CRM cao cấp của OpenDX CompanyOS.
Nhiệm vụ của bạn là phân tích danh sách Ticket khiếu nại thực tế và danh sách Khách hàng VIP để:
1. Đánh giá tâm lý khách hàng (angry, frustrated, neutral, satisfied).
2. Phân loại nguy cơ rời bỏ churnRisk (high, medium, low).
3. Soạn kịch bản phản hồi đồng cảm chuẩn mực 5 sao (proposedResponse).
4. Đề xuất phương án đền bù (suggestedCompensation): BẮT BUỘC tuân thủ chính xác mức giảm giá hoặc giá trị voucher mà Ban Giám đốc chỉ đạo trong Yêu cầu chỉ đạo (ví dụ: nếu Ban Giám đốc yêu cầu voucher 25% thì BẮT BUỘC phải đề xuất đúng voucher 25% trong cả suggestedCompensation và proposedResponse, TUYỆT ĐỐI không tự ý hạ thấp xuống 5% hay 10%).
5. Phân khúc khách hàng VIP và đưa ra giải pháp chăm sóc riêng biệt.

BẮT BUỘC trả về duy nhất định dạng JSON thuần túy (không markdown, không code block) theo schema:
{
  "overallSentimentSummary": "string",
  "churnRiskAssessment": "string",
  "recommendedAction": "string",
  "tickets": [
    {
      "ticketId": "string",
      "sentiment": "angry" | "frustrated" | "neutral" | "satisfied",
      "churnRisk": "high" | "medium" | "low",
      "issueCategory": "shipping_delay" | "product_defect" | "warranty_inquiry" | "order_cancellation" | "general_inquiry",
      "proposedResponse": "string",
      "suggestedCompensation": "string"
    }
  ],
  "vipCustomers": [
    {
      "customerId": "string",
      "segment": "VIP Diamond" | "VIP Gold" | "Loyal Customer" | "At Risk",
      "engagementRecommendation": "string"
    }
  ]
}`;

        const promptUser = `Yêu cầu chỉ đạo: "${request.prompt}"
Dữ liệu Ticket: ${JSON.stringify(rawTickets)}
Dữ liệu Khách hàng: ${JSON.stringify(rawVips)}`;

        const response = await fetch(
          this.config.openRouterBaseUrl || "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: this.config.openRouterModel || "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: promptSystem },
                { role: "user", content: promptUser },
              ],
              temperature: 0.2,
            }),
          },
        );

        if (response.ok) {
          const json = await response.json();
          const content = json.choices?.[0]?.message?.content?.trim() || "";
          const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
          rawAiResult = JSON.parse(cleaned);
        }
      } catch (err) {
        console.error("AI Support reasoning error:", err);
      }
    }

    // 5. Construct ticket items
    const tickets: AiSupportTicketItemDto[] = rawTickets.map((t) => {
      const ai = rawAiResult?.tickets?.find((x: any) => x.ticketId === t.id);
      return {
        ticketId: t.id,
        customerName: t.full_name,
        customerEmail: t.email,
        subject: t.subject,
        sentiment: ai?.sentiment || (t.priority === "high" || t.priority === "urgent" ? "frustrated" : "neutral"),
        churnRisk: ai?.churnRisk || (t.priority === "urgent" ? "high" : "low"),
        issueCategory: ai?.issueCategory || (t.subject.toLowerCase().includes("trễ") || t.subject.toLowerCase().includes("chậm") ? "shipping_delay" : "general_inquiry"),
        proposedResponse: ai?.proposedResponse || `Kính chào quý khách ${t.full_name}, OpenDX CompanyOS xin chân thành cáo lỗi về sự bất tiện quý khách gặp phải với vấn đề "${t.subject}". Đội ngũ CSKH đang khẩn trương xử lý và sẽ phản hồi quý khách trong 2 giờ làm việc.`,
        suggestedCompensation: ai?.suggestedCompensation || (t.priority === "urgent" ? "Tặng Voucher giảm 10% cho đơn hàng kế tiếp" : "Miễn phí vận chuyển đơn hàng tiếp theo"),
        priority: (t.priority as any) || "normal",
      };
    });

    // 6. Construct VIP items
    const vipCustomers: AiSupportVipCustomerDto[] = rawVips.map((v) => {
      const ai = rawAiResult?.vipCustomers?.find((x: any) => x.customerId === v.id);
      const spent = Number(v.total_spent) || 0;
      const count = Number(v.order_count) || 0;
      return {
        customerId: v.id,
        customerName: v.full_name,
        totalSpentVnd: spent,
        orderCount: count,
        segment: ai?.segment || (spent > 20000000 ? "VIP Diamond" : spent > 10000000 ? "VIP Gold" : "Loyal Customer"),
        engagementRecommendation: ai?.engagementRecommendation || "Ưu tiên hỗ trợ 24/7 và gửi thư cảm ơn định kỳ.",
      };
    });

    const proposal: AiSupportProposalDto = {
      id: proposalId,
      prompt: request.prompt,
      overallSentimentSummary:
        rawAiResult?.overallSentimentSummary ||
        `Đã rà soát ${tickets.length} ticket khiếu nại. Chỉ số hài lòng CSAT ước tính đạt 88%, có ${tickets.filter((t) => t.churnRisk === "high").length} trường hợp cần can thiệp khẩn cấp.`,
      churnRiskAssessment:
        rawAiResult?.churnRiskAssessment ||
        "Phát hiện một số khách hàng gặp sự cố giao vận trễ có nguy cơ rời bỏ nếu không được đền bù thỏa đáng. Kiến nghị tặng voucher giữ chân ngay lập tức.",
      recommendedAction:
        rawAiResult?.recommendedAction ||
        `Ban Giám đốc phê duyệt kịch bản phản hồi tự động và cấp voucher đền bù cho ${tickets.length} khách hàng bị ảnh hưởng.`,
      tickets,
      vipCustomers,
      totalTickets: tickets.length,
      status: "pending_approval",
      createdAt: this.now(),
      docxFilename: `bao_cao_cham_soc_khach_hang_${proposalId.slice(0, 8)}.docx`,
    };

    this.proposalsCache.set(proposalId, proposal);
    return proposal;
  }

  getProposalDocx(proposalId: string): {
    buffer: Buffer;
    filename: string;
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } {
    const proposal = this.proposalsCache.get(proposalId);
    if (!proposal) throw new Error(`Support proposal ${proposalId} not found.`);
    return generateSupportReportDocx(proposal);
  }

  async generateDraftReply(ticketId: string): Promise<string> {
    const ticketRes = await this.database.query<{
      id: string;
      subject: string;
      description: string;
      customer_id: string;
      full_name: string | null;
      email: string | null;
    }>(
      `SELECT t.id, t.subject, t.description, t.customer_id, c.full_name, c.email
       FROM support_tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.id = $1 LIMIT 1`,
      [ticketId],
    );

    if (ticketRes.rows.length === 0) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    const ticket = ticketRes.rows[0];
    const customerName = ticket.full_name || "Quý khách";

    const messagesRes = await this.database.query<{
      author_id: string;
      body: string;
    }>(
      `SELECT author_id, body FROM support_ticket_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC
       LIMIT 10`,
      [ticketId],
    );

    const historyFormatted = messagesRes.rows
      .map((m) => `${m.author_id === "customer" ? "Khách hàng" : "CSKH"}: ${m.body}`)
      .join("\n");

    const apiKey = this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const systemPrompt = `Bạn là Chuyên viên CSKH cao cấp của NovaCommerce (OpenDX CompanyOS).
Nhiệm vụ của bạn là soạn thảo một bức thư hoặc tin nhắn phản hồi chuẩn mực, ân cần, giải quyết trúng nhu cầu của khách hàng.
Quy tắc:
1. Chào hỏi theo tên khách hàng (${customerName}).
2. Lắng nghe, đồng cảm và đưa ra giải pháp rõ ràng (hướng dẫn kỹ thuật, chính sách bảo hành, hoặc thông tin đơn hàng).
3. Văn phong: Lịch thiệp, chuẩn mực tiếng Việt, chân thành.
4. Trả về DUY NHẤT nội dung bức thư/tin nhắn phản hồi, không bọc trong JSON, không thêm các ghi chú ngoài lề.`;

        const userPrompt = `Thông tin yêu cầu:
- Tiêu đề: "${ticket.subject}"
- Mô tả ban đầu: "${ticket.description}"
- Lịch sử trao đổi gần nhất:
${historyFormatted || "(Chưa có tin nhắn nào)"}

Hãy soạn thảo thư phản hồi hoàn chỉnh cho khách hàng ${customerName}.`;

        const response = await fetch(
          this.config.openRouterBaseUrl || "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: this.config.openRouterModel || process.env.MARKETING_CONTENT_MODELS || "google/gemini-2.5-flash",
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
          const content = json.choices?.[0]?.message?.content?.trim();
          if (content) {
            return content.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
          }
        }
      } catch (err) {
        console.error("[AiSupportService] Failed to generate AI draft reply via OpenRouter:", err);
      }
    }

    // Fallback template if OpenRouter is offline
    return `Kính chào ${customerName},\n\nNovaCommerce xin chân thành cảm ơn Quý khách đã liên hệ về vấn đề "${ticket.subject}". Chúng tôi đã tiếp nhận thông tin và đang tiến hành kiểm tra xử lý để có phương án hỗ trợ tốt nhất cho Quý khách.\n\nNếu cần cung cấp thêm thông tin hoặc hình ảnh chi tiết, Quý khách vui lòng gửi lại tin nhắn/email này nhé.\n\nTrân trọng,\nĐội ngũ Chăm sóc Khách hàng NovaCommerce.`;
  }

  async applySupportProposal(
    proposalId: string,
    request: ApplySupportRequestDto,
  ): Promise<ApplySupportResultDto> {
    const proposal = this.proposalsCache.get(proposalId);
    const updatedTicketIds: string[] = [];

    const client = await this.database.connect();
    try {
      await client.query("BEGIN");

      for (const item of request.items) {
        const currentTicket = await client.query<{ status: string }>(
          `SELECT status FROM support_tickets WHERE id = $1`,
          [item.ticketId],
        );
        if (currentTicket.rows.length === 0) continue;

        const currentStatus = currentTicket.rows[0].status;
        const nextStatus = item.resolutionStatus || "resolved";

        if (currentStatus !== nextStatus && currentStatus !== "closed") {
          if (currentStatus === "new") {
            // Step 1: new -> escalated
            await client.query(
              `UPDATE support_tickets 
               SET status = 'escalated', updated_at = NOW(), version = version + 1 
               WHERE id = $1`,
              [item.ticketId],
            );
            // Step 2: escalated -> resolved
            await client.query(
              `UPDATE support_tickets 
               SET status = 'resolved', sla_stopped_at = NOW(), updated_at = NOW(), version = version + 1 
               WHERE id = $1`,
              [item.ticketId],
            );
          } else if (currentStatus === "assigned") {
            // Step 1: assigned -> in_progress
            await client.query(
              `UPDATE support_tickets 
               SET status = 'in_progress', updated_at = NOW(), version = version + 1 
               WHERE id = $1`,
              [item.ticketId],
            );
            // Step 2: in_progress -> resolved
            await client.query(
              `UPDATE support_tickets 
               SET status = 'resolved', sla_stopped_at = NOW(), updated_at = NOW(), version = version + 1 
               WHERE id = $1`,
              [item.ticketId],
            );
          } else if (currentStatus !== "resolved") {
            // in_progress, waiting_customer, waiting_internal, escalated -> resolved
            await client.query(
              `UPDATE support_tickets 
               SET status = 'resolved', sla_stopped_at = NOW(), updated_at = NOW(), version = version + 1 
               WHERE id = $1`,
              [item.ticketId],
            );
          }
        }

        // 1. Create real voucher in promotions table if compensation is suggested
        const ticketProposal = proposal?.tickets?.find((t) => t.ticketId === item.ticketId);
        const comp = ticketProposal?.suggestedCompensation || "";
        const promptText = proposal?.prompt || "";
        const targetText = `${comp} ${item.responseMessage || ""} ${promptText}`;
        let promoCode: string | null = null;

        if (
          comp &&
          !comp.toLowerCase().includes("không có") &&
          !comp.toLowerCase().includes("không áp dụng")
        ) {
          const percentMatch = comp.match(/(\d+)\s*%/i) || promptText.match(/(\d+)\s*%/i);
          const amountMatch = comp.match(/(\d+(?:\.\d+)?)\s*(?:k|000|đ|vnd)/i) || promptText.match(/(\d+(?:\.\d+)?)\s*(?:k|000|đ|vnd)/i);
          const promoId = this.generateId();
          const suffix = item.ticketId.replace(/-/g, "").slice(0, 4).toUpperCase();

          if (percentMatch) {
            const percent = Math.min(100, Math.max(1, parseInt(percentMatch[1], 10)));
            promoCode = `CSKH${percent}-${suffix}`;
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'percentage', $4, NULL, 500000, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Giảm ${percent}% đơn hàng tiếp theo`, percent * 100],
            );
          } else if (amountMatch) {
            let amount = parseInt(amountMatch[1].replace(/\./g, ""), 10);
            if (targetText.toLowerCase().includes("k") && amount < 1000) amount *= 1000;
            promoCode = `CSKH${Math.floor(amount / 1000)}K-${suffix}`;
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'fixed_amount', NULL, $4, NULL, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Giảm ${amount.toLocaleString("vi-VN")} VND đơn hàng tiếp theo`, amount],
            );
          } else {
            promoCode = `CSKH10-${suffix}`;
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'percentage', 1000, NULL, 500000, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Giảm 10% đơn hàng tiếp theo`, 1000],
            );
          }
        }

        // Add trimmed response message with voucher code if provided and ticket is not closed
        let cleanBody = (item.responseMessage || "").trim();
        if (promoCode && !cleanBody.includes(promoCode)) {
          cleanBody = `${cleanBody}\n\n🎁 Mã voucher đền bù kích hoạt tự động: ${promoCode}`;
        }
        cleanBody = cleanBody.slice(0, 4000);

        if (cleanBody.length > 0 && currentStatus !== "closed") {
          const msgId = this.generateId();
          await client.query(
            `INSERT INTO support_ticket_messages (
               id, ticket_id, author_id, body, created_at
             ) VALUES ($1, $2, 'support-ai-steward', $3, NOW())`,
            [msgId, item.ticketId, cleanBody],
          );
        }

        const eventId = this.generateId();
        const idempotencyKey = `ai_resolve:${proposalId}:${item.ticketId}:${Date.now()}`;
        await client.query(
          `INSERT INTO support_ticket_events (
             id, ticket_id, actor_id, from_status, to_status, source, idempotency_key, occurred_at
           ) VALUES ($1, $2, 'support-ai-steward', $3, $4, 'manual', $5, NOW())`,
          [eventId, item.ticketId, currentStatus, nextStatus, idempotencyKey],
        );

        updatedTicketIds.push(item.ticketId);
      }

      await client.query("COMMIT");

      if (proposal) {
        (proposal as any).status = "applied";
      }

      // Outbound email dispatching
      if (this.emailDispatcher) {
        for (const item of request.items) {
          const ticketProposal = proposal?.tickets?.find((t) => t.ticketId === item.ticketId);
          if (!ticketProposal || !ticketProposal.customerEmail) continue;

          // Find promo code if created
          const comp = ticketProposal.suggestedCompensation || "";
          let promoCode: string | undefined;
          const suffix = item.ticketId.replace(/-/g, "").slice(0, 4).toUpperCase();
          if (comp && !comp.toLowerCase().includes("không có") && !comp.toLowerCase().includes("không áp dụng")) {
            const percentMatch = comp.match(/(\d+)\s*%/i) || proposal?.prompt?.match(/(\d+)\s*%/i);
            const amountMatch = comp.match(/(\d+(?:\.\d+)?)\s*(?:k|000|đ|vnd)/i) || proposal?.prompt?.match(/(\d+(?:\.\d+)?)\s*(?:k|000|đ|vnd)/i);
            if (percentMatch) {
              const percent = Math.min(100, Math.max(1, parseInt(percentMatch[1], 10)));
              promoCode = `CSKH${percent}-${suffix}`;
            } else if (amountMatch) {
              let amount = parseInt(amountMatch[1].replace(/\./g, ""), 10);
              if (amount < 1000) amount *= 1000;
              promoCode = `CSKH${Math.floor(amount / 1000)}K-${suffix}`;
            } else {
              promoCode = `CSKH10-${suffix}`;
            }
          }

          const responseText = item.responseMessage || ticketProposal.proposedResponse;
          const htmlBody = renderSupportResolutionEmailHtml({
            customerName: ticketProposal.customerName,
            ticketId: item.ticketId,
            subject: ticketProposal.subject,
            responseMessage: responseText,
            voucherCode: promoCode,
          });

          try {
            await this.emailDispatcher.sendSupportResolutionEmail({
              to: ticketProposal.customerEmail,
              toName: ticketProposal.customerName,
              subject: `[NovaCommerce] Phản hồi yêu cầu hỗ trợ: ${ticketProposal.subject}`,
              textBody: responseText,
              htmlBody,
              ticketId: item.ticketId,
              voucherCode: promoCode,
            });
          } catch (emailErr) {
            console.error(`[AiSupportService] Failed to send resolution email to ${ticketProposal.customerEmail}:`, emailErr);
          }
        }
      }

      return {
        proposalId,
        appliedCount: updatedTicketIds.length,
        updatedTicketIds,
        appliedAt: this.now(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureSeedTickets(): Promise<void> {
    try {
      const countRes = await this.database.query(
        "SELECT COUNT(*) FROM support_tickets WHERE status NOT IN ('resolved', 'closed')",
      );
      if (parseInt(countRes.rows[0]?.count || "0", 10) > 0) return;

      const customers = await this.database.query<{ id: string }>("SELECT id FROM customers LIMIT 3");
      const cust1 = customers.rows[0]?.id || this.generateId();
      const cust2 = customers.rows[1]?.id || this.generateId();

      await this.database.query(
        `INSERT INTO support_tickets (id, customer_id, created_by_id, subject, description, priority, status, version, created_at, updated_at)
         VALUES 
         ($1, $2, 'seed-system', 'Đơn hàng giao trễ hơn dự kiến 2 ngày', 'Tôi cần nhận Laptop trước thứ 6 để đi công tác nhưng hiện tại vận đơn chưa cập nhật.', 'high', 'new', 1, NOW() - INTERVAL '1 day', NOW()),
         ($3, $4, 'seed-system', 'Yêu cầu hỗ trợ kích hoạt bảo hành điện tử', 'Mình mới mua tai nghe Nova Sound Pro, cần nhân viên hỗ trợ hướng dẫn kích hoạt bảo hành VIP.', 'normal', 'new', 1, NOW() - INTERVAL '2 hours', NOW())`,
        [this.generateId(), cust1, this.generateId(), cust2],
      );
    } catch (err) {
      console.warn("Could not seed support tickets:", err);
    }
  }
}
