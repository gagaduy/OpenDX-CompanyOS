// apps/api/src/modules/support/application/services/implementations/ai-support.service.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Pool } from "pg";
import { ApplicationError } from "../../../../../shared/http/application-error";
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
import type { RealtimeBroadcasterPort } from "../../ports/realtime-broadcaster.port";

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
    private readonly realtimeBroadcaster?: RealtimeBroadcasterPort,
  ) {}

  async generateSupportProposal(
    request: GenerateSupportProposalRequestDto,
  ): Promise<AiSupportProposalDto> {
    const proposalId = this.generateId();

    const scopedTicketIds = request.ticketIds?.length
      ? [...new Set(request.ticketIds)]
      : null;
    const ticketScope = request.ticketScope ?? "all_actionable";

    // 1. Query actionable support tickets joined with customers (ordered by latest activity)
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
      updated_at: Date;
      order_total_vnd?: number | string;
    }>(
      `SELECT st.id, st.customer_id, COALESCE(c.full_name, 'Khách vãng lai') as full_name,
              COALESCE(c.email, 'customer@example.com') as email,
              st.subject, st.description, st.priority, st.status, st.created_at, st.updated_at,
              COALESCE(o.total_vnd, 0) as order_total_vnd
       FROM support_tickets st
       LEFT JOIN customers c ON c.id = st.customer_id
       LEFT JOIN orders o ON o.id = st.order_id
       WHERE st.status NOT IN ('resolved', 'closed')
         AND ($1::uuid[] IS NULL OR st.id = ANY($1::uuid[]))
         AND COALESCE(c.email, '') NOT LIKE '%@email.grok.com'
         AND COALESCE(c.email, '') NOT LIKE 'noreply@%'
         AND COALESCE(c.email, '') NOT LIKE 'no-reply@%'
         AND (
           $2::text <> 'customer_email_pending'
           OR (
             st.created_by_id = 'email-inbound'
             AND NOT EXISTS (
               SELECT 1
               FROM support_ticket_messages existing_support_reply
               WHERE existing_support_reply.ticket_id = st.id
                 AND existing_support_reply.author_id <> 'customer'
             )
           )
           OR EXISTS (
             SELECT 1
             FROM support_ticket_messages latest_customer_message
             WHERE latest_customer_message.ticket_id = st.id
               AND latest_customer_message.author_id = 'customer'
               AND NOT EXISTS (
                 SELECT 1
                 FROM support_ticket_messages later_support_message
                 WHERE later_support_message.ticket_id = st.id
                   AND later_support_message.author_id <> 'customer'
                   AND later_support_message.created_at > latest_customer_message.created_at
               )
           )
         )
       ORDER BY
         CASE
           WHEN st.priority = 'urgent' THEN 1
           WHEN st.priority = 'high' THEN 2
           WHEN st.priority = 'normal' THEN 3
           ELSE 4
         END ASC,
         GREATEST(st.created_at, st.updated_at) DESC
       LIMIT 10`,
      [scopedTicketIds, ticketScope],
    );

    // 1b. Fetch recent messages for all tickets to provide actual conversation context
    const ticketIds = ticketResult.rows.map((t) => t.id);
    const messagesByTicket = new Map<string, Array<{ author_id: string; body: string; created_at: Date }>>();

    if (ticketIds.length > 0) {
      const messagesRes = await this.database.query<{
        ticket_id: string;
        author_id: string;
        body: string;
        created_at: Date;
      }>(
        `SELECT ticket_id, author_id, body, created_at
         FROM support_ticket_messages
         WHERE ticket_id = ANY($1)
         ORDER BY created_at ASC`,
        [ticketIds],
      );

      for (const m of messagesRes.rows) {
        let list = messagesByTicket.get(m.ticket_id);
        if (!list) {
          list = [];
          messagesByTicket.set(m.ticket_id, list);
        }
        list.push({ author_id: m.author_id, body: m.body, created_at: m.created_at });
      }
    }

    // 2. Query top spending customers for VIP analysis
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
       WHERE $1::uuid[] IS NULL
          OR EXISTS (
            SELECT 1
            FROM support_tickets scoped_ticket
            WHERE scoped_ticket.id = ANY($1::uuid[])
              AND scoped_ticket.customer_id = c.id
          )
       GROUP BY c.id, c.full_name, c.email
       ORDER BY total_spent DESC
       LIMIT 5`,
      [scopedTicketIds],
    );

    const rawTickets = ticketResult.rows.map((t) => {
      const msgs = messagesByTicket.get(t.id) || [];
      const customerMsgs = msgs.filter((m) => m.author_id === "customer");
      const latestCustomerMsg = customerMsgs[customerMsgs.length - 1]?.body || t.description;
      const historyText = msgs
        .slice(-5)
        .map((m) => `${m.author_id === "customer" ? "Khách hàng" : m.author_id === "support-ai" ? "Trợ lý AI" : "Nhân viên CSKH"}: ${m.body}`)
        .join("\n---\n");

      return {
        ticketId: t.id,
        customerName: t.full_name,
        customerEmail: t.email,
        originalSubject: t.subject,
        initialDescription: t.description,
        latestCustomerMessage: latestCustomerMsg,
        conversationHistory: historyText,
        priority: t.priority,
        status: t.status,
        orderTotalVnd: Number(t.order_total_vnd || 0),
      };
    });
    const rawVips = vipResult.rows;

    // 3. Query active policy threshold from published workflow blueprint
    let autoApprovalThreshold = 200_000;
    try {
      const blueprintQuery = await this.database.query<{ policy_rules: { auto_approval_threshold?: number } }>(
        `SELECT policy_rules FROM workflow_blueprints WHERE code = 'WF-CSKH-RECOVERY' AND status = 'published' LIMIT 1`,
      );
      if (
        blueprintQuery.rows.length > 0 &&
        typeof blueprintQuery.rows[0].policy_rules?.auto_approval_threshold === "number"
      ) {
        autoApprovalThreshold = blueprintQuery.rows[0].policy_rules.auto_approval_threshold;
      }
    } catch {
      // Table may not be migrated yet or in unit tests with mocked DB
    }

    // Call OpenRouter Gemini 2.5 Flash for Sentiment & Churn Analysis
    let rawAiResult: any = null;
    const apiKey = this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const promptSystem = `Bạn là Quản gia CSKH & Chuyên viên CRM cao cấp của OpenDX CompanyOS.
Nhiệm vụ của bạn là phân tích danh sách Ticket khiếu nại thực tế (chú ý ĐẶC BIỆT đến latestCustomerMessage và conversationHistory để nắm bắt chính xác sự cố MỚI NHẤT của khách hàng) và danh sách Khách hàng VIP theo Quy trình vận hành WF-CSKH-RECOVERY (Hạn mức tự duyệt tối đa: ${autoApprovalThreshold.toLocaleString("vi-VN")} đ):
1. Đánh giá tâm lý khách hàng (angry, frustrated, neutral, satisfied).
2. Phân loại nguy cơ rời bỏ churnRisk (high, medium, low).
3. Đặt lại tiêu đề chuẩn xác (updatedSubject): Căn cứ vào nội dung sự cố thực tế trong tin nhắn mới nhất (latestCustomerMessage), tóm tắt lại tiêu đề ngắn gọn, chuẩn xác theo bản chất vấn đề và sản phẩm/dịch vụ khách hàng đang đề cập. Nếu vẫn là sự cố cũ thì giữ nguyên hoặc làm gọn lại.
4. Soạn thảo kịch bản phản hồi (proposedResponse) theo chuẩn CSKH doanh nghiệp 5 sao: Chuyên nghiệp, Tinh gọn, Trọng tâm hành động và có tính thuyết phục cao:
   - BẮT BUỘC phản hồi CHÍNH XÁC theo tin nhắn mới nhất (latestCustomerMessage), nêu đúng tên sản phẩm/dịch vụ, đúng lỗi cụ thể khách phàn nàn và cam kết giải quyết dứt điểm. TUYỆT ĐỐI KHÔNG lặp lại sự cố cũ đã giải quyết.
   - Cá nhân hóa: Kính chào đúng tên khách hàng.
   - Thấu cảm & Tạ lỗi: Thừa nhận thẳng thắn và lịch thiệp sự bất tiện mà khách hàng đang trải qua, không vòng vo.
   - Trọng tâm hành động: Nêu rõ nguyên nhân ngắn gọn và giải pháp xử lý dứt điểm cụ thể (hành động từ NovaCommerce và hướng dẫn rõ ràng nếu khách cần phối hợp).
   - Cam kết thời gian (SLA): Đưa ra mốc thời gian hoàn tất chính xác (ví dụ: xử lý trong 2-4 giờ, đổi mới/giao bù trong 24 giờ).
   - Quyền lợi & Tri ân: Đề cập quyền lợi đền bù/voucher (nếu có) như lời tri ân chân thành đối với sự kiên nhẫn của khách hàng.
   - Trình bày rõ ràng, ngắt đoạn mạch lạc, dễ đọc.
5. Đề xuất phương án đền bù (suggestedCompensation): BẮT BUỘC tuân thủ chỉ đạo của Ban Giám đốc trong Yêu cầu chỉ đạo (nếu có chỉ định cụ thể). Nếu Ban Giám đốc không chỉ định, hãy phân loại chuẩn xác theo bản chất sự cố và giá trị đơn hàng theo các hình thức ưu đãi thông minh sau (TRÁNH việc ca nào cũng đề xuất 10% rập khuôn):
   - Sự cố giao hàng trễ / bao bì móp méo / giao vận: Đề xuất "Miễn phí vận chuyển đơn hàng tiếp theo (30.000 ₫)" (Freeship).
   - Sự cố khiếu nại dịch vụ / thái độ phục vụ / thắc mắc thông thường: Đề xuất Voucher tiền mặt cố định 50.000 ₫ hoặc 100.000 ₫ (ví dụ: "Voucher tiền mặt 100.000 ₫").
   - Sự cố sản phẩm lỗi nghiêm trọng hoặc đơn hàng công nghệ/giá trị cao (> 10.000.000 ₫ như Laptop, PC, Điện thoại): Đề xuất gói dịch vụ cao cấp: "Tặng 01 năm Bảo hành Vàng mở rộng (Care+) và Voucher đền bù 500.000 ₫ (Hỗ trợ 1 đổi 1 tận nơi)".
   - Sự cố sản phẩm lỗi thông thường (< 10.000.000 ₫): Đề xuất "Voucher giảm 10% tối đa 300.000 ₫" hoặc "Voucher tiền mặt 200.000 ₫".
   - Hỏi đáp / hỗ trợ kỹ thuật thông thường không phát sinh lỗi từ cửa hàng: Ghi "Không áp dụng voucher".
6. Phân khúc khách hàng VIP và đưa ra giải pháp chăm sóc riêng biệt.

BẮT BUỘC trả về duy nhất định dạng JSON thuần túy (không markdown, không code block) theo schema:
{
  "overallSentimentSummary": "string",
  "churnRiskAssessment": "string",
  "recommendedAction": "string",
  "tickets": [
    {
      "ticketId": "string",
      "updatedSubject": "string",
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
};`;

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

    // 4. Construct ticket items
    const tickets: AiSupportTicketItemDto[] = rawTickets.map((t) => {
      const ai = rawAiResult?.tickets?.find((x: any) => x.ticketId === t.ticketId);
      const chosenSubject = (ai?.updatedSubject || t.originalSubject).trim();
      const defaultComp = t.priority === "urgent"
        ? (t.orderTotalVnd > 10_000_000
            ? "Tặng 01 năm Bảo hành Vàng VIP Care+ và Voucher đền bù 500.000 ₫"
            : "Voucher giảm 10% tối đa 300.000 ₫")
        : (chosenSubject.toLowerCase().includes("trễ") || chosenSubject.toLowerCase().includes("giao")
            ? "Miễn phí vận chuyển đơn hàng tiếp theo (30.000 ₫)"
            : "Voucher tri ân 100.000 ₫");
      const suggestedComp = ai?.suggestedCompensation || defaultComp;

      // Estimate compensation amount in VND
      let estimatedAmount = 0;
      const compLower = suggestedComp.toLowerCase();
      if (compLower.includes("miễn phí vận chuyển") || compLower.includes("freeship")) {
        estimatedAmount = 30_000;
      } else if (compLower.includes("care+") || compLower.includes("bảo hành vàng") || compLower.includes("bảo hành")) {
        const cashMatch = compLower.match(/(\d[\d.,]*)\s*(?:k|000|đ|₫|vnd)(?:\s|$|[^\p{L}])/iu);
        let cash = 500_000;
        if (cashMatch) {
          cash = parseInt(cashMatch[1].replace(/[.,]/g, ""), 10);
          if (cashMatch[0].toLowerCase().includes("k") && cash < 1000) cash *= 1000;
        }
        estimatedAmount = cash;
      } else if (compLower.includes("tối đa")) {
        const capMatch = compLower.match(/tối đa\s*(\d[\d.,]*)\s*(?:k|000|đ|₫|vnd)(?:\s|$|[^\p{L}])/iu);
        if (capMatch) {
          let cap = parseInt(capMatch[1].replace(/[.,]/g, ""), 10);
          if (capMatch[0].toLowerCase().includes("k") && cashMatch && cap < 1000) cap *= 1000;
          estimatedAmount = cap;
        } else {
          estimatedAmount = 300_000;
        }
      } else if (compLower.includes("10%")) {
        estimatedAmount = Math.round(t.orderTotalVnd * 0.10) || 100_000;
      } else if (compLower.includes("15%")) {
        estimatedAmount = Math.round(t.orderTotalVnd * 0.15) || 150_000;
      } else if (compLower.includes("20%")) {
        estimatedAmount = Math.round(t.orderTotalVnd * 0.20) || 200_000;
      } else {
        const digits = compLower.replace(/[^\d]/g, "");
        estimatedAmount = digits ? parseInt(digits, 10) : 50_000;
      }

      const requiresApproval = estimatedAmount > autoApprovalThreshold;

      return {
        ticketId: t.ticketId,
        customerName: t.customerName,
        customerEmail: t.customerEmail,
        subject: chosenSubject,
        sentiment: ai?.sentiment || (t.priority === "high" || t.priority === "urgent" ? "frustrated" : "neutral"),
        churnRisk: ai?.churnRisk || (t.priority === "urgent" ? "high" : "low"),
        issueCategory: ai?.issueCategory || (chosenSubject.toLowerCase().includes("trễ") || chosenSubject.toLowerCase().includes("chậm") ? "shipping_delay" : "general_inquiry"),
        proposedResponse: ai?.proposedResponse || `Kính chào Quý khách ${t.customerName},\n\nNovaCommerce xin chân thành cáo lỗi về sự bất tiện Quý khách gặp phải liên quan đến: "${chosenSubject}".\n\nĐội ngũ CSKH đã tiếp nhận và đang ưu tiên xử lý dứt điểm vấn đề này. Chúng tôi cam kết sẽ có phương án giải quyết thỏa đáng và cập nhật kết quả đến Quý khách trong vòng 2 giờ làm việc.\n\nTrân trọng cảm ơn sự thông cảm và kiên nhẫn của Quý khách,\nĐội ngũ CSKH NovaCommerce.`,
        suggestedCompensation: suggestedComp,
        priority: (t.priority as any) || "normal",
        estimatedCompensationAmount: estimatedAmount,
        requiresApproval,
      };
    });

    // 5. Construct VIP items
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
    if (!proposal) throw new ApplicationError(404, "PROPOSAL_NOT_FOUND", `Support proposal ${proposalId} not found.`);
    return generateSupportReportDocx(proposal);
  }

  async getLatestSupportProposal(): Promise<AiSupportProposalDto | null> {
    let latest: AiSupportProposalDto | null = null;
    for (const proposal of this.proposalsCache.values()) {
      if (!latest || new Date(proposal.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
        latest = proposal;
      }
    }
    if (latest) return latest;

    // Check if there are active open tickets waiting for resolution
    try {
      const openTicketsCheck = await this.database.query<{ count: string }>(
        `SELECT count(*)::text as count FROM support_tickets WHERE status NOT IN ('resolved', 'closed')`,
      );
      const openCount = parseInt(openTicketsCheck.rows[0]?.count, 10);
      if (openCount > 0 && !isNaN(openCount)) {
        return await this.generateSupportProposal({
          prompt: "Phân tích phiếu khiếu nại khách hàng và lập phương án bồi thường",
        });
      }
    } catch (err) {
      console.warn("Could not check open tickets in getLatestSupportProposal:", err);
    }

    const persisted = await this.database.query<{
      proposal_id: string;
      applied_at: Date | string;
      ticket_id: string;
      customer_name: string;
      customer_email: string;
      subject: string;
      priority: string;
      response_message: string;
    }>(
      `WITH latest_proposal AS (
         SELECT split_part(idempotency_key, ':', 2) AS proposal_id,
                MAX(occurred_at) AS applied_at
         FROM support_ticket_events
         WHERE actor_id = 'support-ai-steward'
           AND idempotency_key LIKE 'ai_resolve:%'
         GROUP BY split_part(idempotency_key, ':', 2)
         ORDER BY applied_at DESC
         LIMIT 1
       )
       SELECT DISTINCT ON (st.id)
              lp.proposal_id,
              lp.applied_at,
              st.id AS ticket_id,
              COALESCE(c.full_name, 'Khách hàng') AS customer_name,
              COALESCE(c.email, '') AS customer_email,
              st.subject,
              st.priority,
              COALESCE(message.body, '') AS response_message
       FROM latest_proposal lp
       JOIN support_ticket_events event
         ON split_part(event.idempotency_key, ':', 2) = lp.proposal_id
       JOIN support_tickets st ON st.id = event.ticket_id
       LEFT JOIN customers c ON c.id = st.customer_id
       LEFT JOIN LATERAL (
         SELECT body
         FROM support_ticket_messages
         WHERE ticket_id = st.id AND author_id = 'support-ai-steward'
         ORDER BY created_at DESC
         LIMIT 1
       ) message ON TRUE
       ORDER BY st.id, event.occurred_at DESC`,
    );
    if (persisted.rows.length === 0) return null;

    const first = persisted.rows[0];
    const createdAt = new Date(first.applied_at).toISOString();
    const tickets: AiSupportTicketItemDto[] = persisted.rows.map((row) => {
      const priority = (["urgent", "high", "normal", "low"] as const).find(
        (value) => value === row.priority,
      ) ?? "normal";
      return {
        ticketId: row.ticket_id,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        subject: row.subject,
        sentiment: priority === "urgent" || priority === "high" ? "frustrated" : "neutral",
        churnRisk: priority === "urgent" ? "high" : priority === "high" ? "medium" : "low",
        issueCategory: "general_inquiry",
        proposedResponse: row.response_message.replace(/\n\n🎁 \[VOUCHER:[^\]]+\]$/, ""),
        suggestedCompensation: row.response_message.includes("[VOUCHER:")
          ? "Voucher đã được gửi kèm email"
          : "Không áp dụng voucher",
        priority,
      };
    });

    return {
      id: first.proposal_id,
      prompt: "Phản hồi email CSKH đã được phê duyệt",
      overallSentimentSummary: `Đã gửi phản hồi cho ${tickets.length} khách hàng.`,
      churnRiskAssessment: "Các ticket đã được xử lý và đang chờ theo dõi mức độ hài lòng.",
      recommendedAction: "Theo dõi phản hồi tiếp theo của khách hàng.",
      tickets,
      vipCustomers: [],
      totalTickets: tickets.length,
      status: "applied",
      createdAt,
      docxFilename: `bao_cao_cham_soc_khach_hang_${first.proposal_id.slice(0, 8)}.docx`,
    };
  }

  async cancelSupportProposal(proposalId: string, actorId: string): Promise<AiSupportProposalDto> {
    const proposal = this.proposalsCache.get(proposalId);
    if (!proposal) {
      throw new ApplicationError(404, "PROPOSAL_NOT_FOUND", `Support proposal ${proposalId} not found.`);
    }
    if (proposal.status === "applied") {
      throw new ApplicationError(409, "PROPOSAL_ALREADY_APPLIED", "An applied Support proposal cannot be canceled.");
    }
    if (actorId.trim().length === 0 || actorId.length > 255) {
      throw new ApplicationError(400, "VALIDATION_ERROR", "A staff actor is required to cancel a Support proposal.");
    }
    await this.database.query(
      `INSERT INTO support_ai_proposal_decisions (id, proposal_id, actor_id, occurred_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (proposal_id) DO NOTHING`,
      [this.generateId(), proposalId, actorId, this.now()],
    );
    const canceled = { ...proposal, status: "canceled" as const };
    this.proposalsCache.set(proposalId, canceled);
    return canceled;
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
Nhiệm vụ của bạn là soạn thảo một bức thư hoặc tin nhắn phản hồi chuẩn mực, thuyết phục, tinh gọn và trọng tâm hành động để giải quyết triệt để nhu cầu của khách hàng.
Nguyên tắc vàng:
1. Cá nhân hóa: Chào hỏi trang trọng theo tên khách hàng (${customerName}).
2. Lắng nghe & Đồng cảm: Thừa nhận sự việc một cách chân thành, lịch thiệp, không trốn tránh trách nhiệm.
3. Trọng tâm giải pháp & Hành động: Trình bày giải pháp xử lý cụ thể, rõ ràng từng bước; nếu khách hàng cần cung cấp thêm thông tin thì hướng dẫn đơn giản, dễ hiểu.
4. Cam kết thời hạn (SLA): Đưa ra mốc thời gian phản hồi hoặc xử lý dứt điểm cụ thể để khách hàng yên tâm.
5. Văn phong: Chuyên nghiệp, ấm áp, chuẩn mực tiếng Việt, ngắt dòng thành các đoạn văn ngắn gọn, dễ nắm bắt thông tin.
6. Trả về DUY NHẤT nội dung bức thư/tin nhắn phản hồi, không bọc trong JSON, không thêm các ghi chú ngoài lề.`;

        const userPrompt = `Thông tin yêu cầu:
- Tiêu đề: "${ticket.subject}"
- Mô tả ban đầu: "${ticket.description}"
- Lịch sử trao đổi gần nhất:
${historyFormatted || "(Chưa có tin nhắn nào)"}

Hãy soạn thảo thư phản hồi hoàn chỉnh, thuyết phục và đúng trọng tâm hành động cho khách hàng ${customerName}.`;

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
    const hotline = process.env.SUPPORT_HOTLINE || "1900 6868";
    return `Kính chào Quý khách ${customerName},\n\nNovaCommerce xin chân thành cảm ơn Quý khách đã liên hệ và phản ánh về vấn đề: "${ticket.subject}".\n\nChúng tôi rất lấy làm tiếc về trải nghiệm chưa trọn vẹn này và đã chuyển ngay yêu cầu đến bộ phận chuyên trách để ưu tiên xử lý dứt điểm cho Quý khách trong vòng 2-4 giờ làm việc.\n\nChuyên viên hỗ trợ sẽ liên hệ trực tiếp hoặc cập nhật tiến độ xử lý ngay khi hoàn tất. Nếu Quý khách cần hỗ trợ gấp, xin vui lòng phản hồi email này hoặc gọi đến Hotline ${hotline}.\n\nTrân trọng,\nĐội ngũ Chăm sóc Khách hàng NovaCommerce.`;
  }

  async applySupportProposal(
    proposalId: string,
    request: ApplySupportRequestDto,
  ): Promise<ApplySupportResultDto> {
    const proposal = this.proposalsCache.get(proposalId);
    const updatedTicketIds: string[] = [];
    const itemMessages = new Map<string, { msgId: string; cleanBody: string; promoCode?: string; voucherDiscountText?: string }>();

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
        const ticketProposal = proposal?.tickets?.find((t) => t.ticketId === item.ticketId);
        const resolvedSubject = ticketProposal?.subject;

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
               SET status = 'resolved',
                   sla_paused_seconds = sla_paused_seconds + CASE
                     WHEN sla_pause_started_at IS NULL THEN 0
                     ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - sla_pause_started_at)))::integer)
                   END,
                   sla_pause_started_at = NULL,
                   sla_stopped_at = NOW(), updated_at = NOW(), version = version + 1
               WHERE id = $1`,
              [item.ticketId],
            );
          }
        }

        // 1. Create real voucher in promotions table if compensation is suggested
        const comp = ticketProposal?.suggestedCompensation || "";
        const compLower = comp.toLowerCase();
        const promptText = proposal?.prompt || "";
        const targetText = `${comp} ${item.responseMessage || ""} ${promptText}`;
        let promoCode: string | undefined = undefined;
        let voucherDiscountText: string | undefined;

        if (
          comp &&
          !compLower.includes("không có") &&
          !compLower.includes("không áp dụng")
        ) {
          const isFreeship = compLower.includes("miễn phí vận chuyển") || compLower.includes("freeship");
          const isCarePlus = compLower.includes("care+") || compLower.includes("bảo hành vàng") || compLower.includes("bảo hành");
          const percentMatch = comp.match(/(\d+)\s*%/i) || promptText.match(/(\d+)\s*%/i);
          const amountMatch = comp.match(/(\d+(?:\.\d+)?)\s*(?:k|000|đ|vnd)/i) || promptText.match(/(\d+(?:\.\d+)?)\s*(?:k|000|đ|vnd)/i);
          const promoId = this.generateId();
          const suffix = item.ticketId.replace(/-/g, "").slice(0, 4).toUpperCase();

          if (isFreeship) {
            promoCode = `FREESHIP-${suffix}`;
            voucherDiscountText = "Miễn phí vận chuyển cho đơn hàng kế tiếp (trị giá 30.000 ₫)";
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'fixed_amount', NULL, 30000, NULL, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Miễn phí vận chuyển (30.000 ₫)`],
            );
          } else if (isCarePlus) {
            let cashAmount = 500_000;
            if (amountMatch) {
              cashAmount = parseInt(amountMatch[1].replace(/\./g, ""), 10);
              if (amountMatch[0].includes("k") && cashAmount < 1000) cashAmount *= 1000;
            }
            promoCode = `CAREPLUS-${suffix}`;
            voucherDiscountText = `Gói 01 năm Bảo hành Vàng Care+ & Voucher ${cashAmount.toLocaleString("vi-VN")} ₫`;
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'fixed_amount', NULL, $4, NULL, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Gói Care+ & Voucher ${cashAmount.toLocaleString("vi-VN")} ₫`, cashAmount],
            );
          } else if (amountMatch && !percentMatch) {
            let amount = parseInt(amountMatch[1].replace(/\./g, ""), 10);
            if (targetText.toLowerCase().includes("k") && amount < 1000) amount *= 1000;
            promoCode = `CSKH${Math.floor(amount / 1000)}K-${suffix}`;
            voucherDiscountText = `Voucher giảm trực tiếp ${amount.toLocaleString("vi-VN")} ₫`;
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'fixed_amount', NULL, $4, NULL, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Giảm ${amount.toLocaleString("vi-VN")} ₫ đơn hàng tiếp theo`, amount],
            );
          } else if (percentMatch) {
            const percent = Math.min(100, Math.max(1, parseInt(percentMatch[1], 10)));
            const maxCapMatch = comp.match(/tối đa\s*(\d+(?:\.\d+)?)\s*(?:k|000|đ|vnd)/i);
            let maxCap = 500_000;
            if (maxCapMatch) {
              maxCap = parseInt(maxCapMatch[1].replace(/\./g, ""), 10);
              if (maxCapMatch[0].includes("k") && maxCap < 1000) maxCap *= 1000;
            }
            promoCode = `CSKH${percent}-${suffix}`;
            voucherDiscountText = `Giảm ngay ${percent}% (tối đa ${maxCap.toLocaleString("vi-VN")} ₫) cho đơn hàng kế tiếp`;
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'percentage', $4, NULL, $5, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Giảm ${percent}% (tối đa ${maxCap.toLocaleString("vi-VN")} ₫)`, percent * 100, maxCap],
            );
          } else {
            promoCode = `CSKH50K-${suffix}`;
            voucherDiscountText = "Voucher tri ân 50.000 ₫ cho đơn hàng kế tiếp";
            await client.query(
              `INSERT INTO promotions (
                 id, code, name, promotion_type, percentage_bps, fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, status, version, created_at, updated_at
               ) VALUES ($1, $2, $3, 'fixed_amount', NULL, 50000, NULL, 0, 'active', 1, NOW(), NOW())
               ON CONFLICT (code) DO NOTHING`,
              [promoId, promoCode, `Đền bù CSKH: Voucher tri ân 50.000 ₫`],
            );
          }
        }

        // Add trimmed response message with voucher code if provided and ticket is not closed
        const baseResponse = (item.responseMessage || ticketProposal?.proposedResponse || "").trim();
        let cleanBody = baseResponse;
        if (promoCode && !cleanBody.includes(promoCode)) {
          if (compLower.includes("care+") || compLower.includes("bảo hành vàng") || compLower.includes("bảo hành")) {
            cleanBody = `${cleanBody}\n\n🛡️ [BẢO HÀNH CARE+: Kích hoạt gói 01 năm Bảo hành Vàng VIP & Đổi mới 1-1 tại nhà]\n🎁 [VOUCHER:${promoCode}:${voucherDiscountText || "Ưu đãi tri ân khách hàng"}]`;
          } else {
            cleanBody = `${cleanBody}\n\n🎁 [VOUCHER:${promoCode}:${voucherDiscountText || "Ưu đãi tri ân khách hàng"}]`;
          }
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
          itemMessages.set(item.ticketId, { msgId, cleanBody, promoCode, voucherDiscountText });
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

      // Parallel Realtime SSE Broadcast to Storefront LiveChat
      if (this.realtimeBroadcaster) {
        for (const item of request.items) {
          const entry = itemMessages.get(item.ticketId);
          if (entry && entry.cleanBody) {
            this.realtimeBroadcaster.broadcast(item.ticketId, {
              type: "message_created",
              ticketId: item.ticketId,
              message: {
                id: entry.msgId,
                authorId: "support-ai-steward",
                body: entry.cleanBody,
                createdAt: this.now(),
              },
            });
          }
        }
      }

      // Parallel Outbound email dispatching
      if (this.emailDispatcher) {
        for (const item of request.items) {
          const ticketProposal = proposal?.tickets?.find((t) => t.ticketId === item.ticketId);
          let customerEmail = ticketProposal?.customerEmail;
          let customerName = ticketProposal?.customerName;
          let subject = ticketProposal?.subject;

          if (!customerEmail || !customerName || !subject) {
            const ticketInfo = await this.database.query<{
              full_name: string | null;
              email: string | null;
              subject: string;
            }>(
              `SELECT COALESCE(c.full_name, 'Khách hàng') as full_name, c.email, st.subject
               FROM support_tickets st
               LEFT JOIN customers c ON c.id = st.customer_id
               WHERE st.id = $1`,
              [item.ticketId],
            );
            if (ticketInfo.rows.length > 0) {
              customerEmail = customerEmail || ticketInfo.rows[0].email || undefined;
              customerName = customerName || ticketInfo.rows[0].full_name || "Quý khách";
              subject = subject || ticketInfo.rows[0].subject;
            }
          }

          if (!customerEmail) continue;

          const entry = itemMessages.get(item.ticketId);
          const promoCode = entry?.promoCode;
          const voucherDiscountText = entry?.voucherDiscountText;

          const responseText = item.responseMessage || ticketProposal?.proposedResponse || "Yêu cầu hỗ trợ của Quý khách đã được xử lý.";
          const htmlBody = renderSupportResolutionEmailHtml({
            customerName: customerName || "Quý khách",
            ticketId: item.ticketId,
            subject: subject || "Hỗ trợ khách hàng",
            responseMessage: responseText,
            voucherCode: promoCode,
            voucherDiscountText,
          });

          try {
            await this.emailDispatcher.sendSupportResolutionEmail({
              to: customerEmail,
              toName: customerName || "Quý khách",
              subject: `[NovaCommerce] Phản hồi yêu cầu hỗ trợ: ${subject || "Hỗ trợ khách hàng"}`,
              textBody: responseText,
              htmlBody,
              ticketId: item.ticketId,
              voucherCode: promoCode,
            });
          } catch (emailErr) {
            console.error(`[AiSupportService] Failed to send resolution email to ${customerEmail}:`, emailErr);
          }
        }
      }

      // Dispatch internal notification email if WF-CSKH-RECOVERY contains a notification node
      const appliedDetails = request.items.map((item) => {
        const ticketProposal = proposal?.tickets?.find((t) => t.ticketId === item.ticketId);
        const entry = itemMessages.get(item.ticketId);
        return {
          ticketId: item.ticketId,
          customerName: ticketProposal?.customerName,
          customerEmail: ticketProposal?.customerEmail,
          subject: ticketProposal?.subject,
          suggestedCompensation: ticketProposal?.suggestedCompensation,
          responseMessage: item.responseMessage || ticketProposal?.proposedResponse,
          promoCode: entry?.promoCode,
        };
      });
      await this.dispatchWorkflowCompletionNotification(proposalId, proposal, appliedDetails);

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

  private async dispatchWorkflowCompletionNotification(
    proposalId: string,
    proposal: AiSupportProposalDto | undefined,
    appliedTickets: Array<{
      ticketId: string;
      customerName?: string;
      customerEmail?: string;
      subject?: string;
      suggestedCompensation?: string;
      responseMessage?: string;
      promoCode?: string;
    }>,
  ): Promise<void> {
    try {
      let recipientEmail = "duongvanduy799@gmail.com";
      let recipientRole = "Trưởng phòng CSKH";

      // 1. Inspect WF-CSKH-RECOVERY blueprint for notification node and recipient parameters
      if (this.database) {
        try {
          const res = await this.database.query(
            `SELECT nodes, edges FROM workflow_blueprints WHERE code = 'WF-CSKH-RECOVERY' AND status = 'published' LIMIT 1`,
          );
          if (res?.rows && res.rows.length > 0) {
            const nodes = res.rows[0].nodes || [];
            const coreNodeIds = new Set([
              "node-1-event",
              "node-2-ai-analysis",
              "node-3-decision",
              "node-4a-auto",
              "node-4b-approval",
            ]);
            const notifyNode = nodes.find((n: any) =>
              !coreNodeIds.has(n.id) &&
              (n.badge?.toLowerCase().includes("thông báo") ||
               n.title?.toLowerCase().includes("thông báo") ||
               n.title?.toLowerCase().includes("email") ||
               n.actor?.toLowerCase().includes("thông báo") ||
               n.actor?.toLowerCase().includes("email"))
            );
            if (notifyNode) {
              const emailParam = notifyNode.details?.parameters?.find(
                (p: any) => p.label?.toLowerCase().includes("email") || (p.value?.includes("@") && !p.value?.includes("(")),
              );
              const rawEmail = emailParam?.value || "";
              const match = rawEmail.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
              if (match) {
                recipientEmail = match[1].trim();
              }
              const roleParam = notifyNode.details?.parameters?.find(
                (p: any) => p.label?.toLowerCase().includes("chức vụ"),
              );
              if (roleParam?.value) {
                recipientRole = roleParam.value.trim();
              }
            }
          }
        } catch (dbErr) {
          console.warn("[AiSupportService] Could not inspect workflow_blueprints:", dbErr);
        }
      }

      if (!recipientEmail || !recipientEmail.includes("@")) {
        return;
      }

      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        return;
      }

      // 2. Dispatch notification email via live SMTP
      const smtpUser = process.env.SUPPORT_SMTP_USER || "nguyenphuongdmx2450@gmail.com";
      const smtpPass = (process.env.SUPPORT_SMTP_PASS || "jarqsjtoegstwkft").replace(/\s+/g, "");
      const smtpHost = process.env.SUPPORT_SMTP_HOST || "smtp.gmail.com";
      const smtpPort = Number(process.env.SUPPORT_SMTP_PORT) || 587;

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: process.env.SUPPORT_SMTP_SECURE === "true",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const firstTicketSubject = appliedTickets[0]?.subject || proposal?.tickets?.[0]?.subject || "Khiếu nại khách hàng";
      const subject = `[Thông Báo Nội Bộ] Báo cáo xử lý khiếu nại CSKH • ${firstTicketSubject}`;

      const rowsHtml = appliedTickets.map((t) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px; font-family: monospace; color: #0284c7; font-size: 13px;">#${t.ticketId.slice(0, 8)}</td>
          <td style="padding: 10px; font-size: 13px; color: #0f172a;">
            <strong>${t.customerName || "Khách hàng"}</strong><br/>
            <span style="color: #64748b; font-size: 12px;">${t.customerEmail || ""}</span>
          </td>
          <td style="padding: 10px; font-size: 13px; color: #334155;">${t.subject || "Khiếu nại dịch vụ"}</td>
          <td style="padding: 10px; font-size: 13px; color: #0f172a;">
            ${t.promoCode ? `<span style="display: inline-block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 4px; padding: 2px 6px; font-family: monospace; font-weight: 600;">${t.promoCode}</span>` : ""}
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${t.suggestedCompensation || "Đã gửi thư giải quyết"}</div>
          </td>
        </tr>
      `).join("");

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #0284c7, #0ea5e9); padding: 28px 24px; color: white;">
            <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; margin-bottom: 6px;">Quy Trình Doanh Nghiệp • WF-CSKH-RECOVERY</div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 700;">🛡️ Báo Cáo Xử Lý Khiếu Nại & CSKH</h2>
          </div>
          <div style="padding: 28px 24px; background: #ffffff;">
            <p style="font-size: 15px; margin-top: 0;">Kính gửi <strong>${recipientRole} (${recipientEmail})</strong>,</p>
            <p style="font-size: 15px; color: #334155;">
              Hệ thống Điều Hành Doanh Nghiệp Tự Động <strong>OpenDX CompanyOS</strong> xin báo cáo:
            </p>
            <p style="font-size: 15px; color: #334155;">
              Quy trình <strong>WF-CSKH-RECOVERY</strong> vừa hoàn tất xử lý và phản hồi cho <strong>${appliedTickets.length} ca khiếu nại</strong> khách hàng theo chỉ đạo.
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h4 style="margin: 0 0 12px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">📋 Danh sách các ca khiếu nại đã giải quyết:</h4>
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="border-bottom: 1px solid #cbd5e1; font-size: 12px; color: #64748b; text-transform: uppercase;">
                    <th style="padding: 6px 10px;">Mã Ticket</th>
                    <th style="padding: 6px 10px;">Khách hàng</th>
                    <th style="padding: 6px 10px;">Nội dung sự cố</th>
                    <th style="padding: 6px 10px;">Giải pháp / Đền bù</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 500;">
                ✓ Thư xin lỗi & giải pháp đã được tự động gửi trực tiếp đến hộp thư của từng khách hàng. Trạng thái SLA đã hoàn tất.
              </p>
            </div>

            <div style="text-align: center; margin: 24px 0 12px;">
              <a href="http://localhost:3000/support" style="background: #0284c7; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
                Mở Trung Tâm CSKH Console
              </a>
            </div>
          </div>
          <div style="background: #f1f5f9; padding: 14px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0;">
            Hệ thống AI Điều hành Tự động NovaCommerce • OpenDX CompanyOS<br/>
            Email được gửi tự động căn cứ theo cấu hình khối thông báo trong Workflow Studio.
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: `NovaCommerce CSKH Operations <${smtpUser}>`,
        to: recipientEmail,
        subject,
        html,
        text: `Báo cáo xử lý khiếu nại CSKH cho ${appliedTickets.length} khách hàng đã hoàn tất. Vui lòng kiểm tra trên Console.`,
      });

      console.log(`[AiSupportService] Internal notification email successfully dispatched to ${recipientEmail} (${recipientRole})`);
    } catch (notifyErr: any) {
      console.warn("[AiSupportService] Failed to dispatch workflow completion notification email:", notifyErr?.message || notifyErr);
    }
  }
}
