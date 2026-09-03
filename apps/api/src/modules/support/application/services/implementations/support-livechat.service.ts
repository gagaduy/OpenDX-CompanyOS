// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { RealtimeBroadcasterPort } from "../../ports/realtime-broadcaster.port";
import type { AiLivechatAssistantService } from "./ai-livechat-assistant.service";
import type { SupportMessageDto } from "../../dtos/support.dto";

export interface InitLivechatSessionInput {
  readonly email: string;
  readonly fullName: string;
  readonly message?: string;
  readonly orderId?: string;
}

export interface LivechatSessionResponse {
  readonly sessionId: string;
  readonly ticketId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly messages: readonly SupportMessageDto[];
}

export class SupportLivechatService {
  constructor(
    private readonly database: Pool,
    private readonly realtimeBroadcaster: RealtimeBroadcasterPort,
    private readonly aiAssistant: AiLivechatAssistantService,
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public async initSession(input: InitLivechatSessionInput): Promise<LivechatSessionResponse> {
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanName = input.fullName.trim() || cleanEmail.split("@")[0];

    // 1. Resolve or create customer
    let customerId: string;
    const custRes = await this.database.query<{ id: string }>(
      `SELECT id FROM customers WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail],
    );

    if (custRes.rows.length > 0) {
      customerId = custRes.rows[0].id;
    } else {
      customerId = this.generateId();
      await this.database.query(
        `INSERT INTO customers (id, full_name, email, email_verified_at, status, version, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), 'active', 1, NOW(), NOW())`,
        [customerId, cleanName, cleanEmail],
      );
    }

    // 2. Check if customer already has an active livechat ticket (status not closed/resolved)
    let ticketId: string;
    const activeTicket = await this.database.query<{ id: string }>(
      `SELECT id FROM support_tickets 
       WHERE customer_id = $1 AND status NOT IN ('closed', 'resolved') AND subject LIKE '[LiveChat]%' 
       ORDER BY updated_at DESC LIMIT 1`,
      [customerId],
    );

    if (activeTicket.rows.length > 0) {
      ticketId = activeTicket.rows[0].id;
    } else {
      ticketId = this.generateId();
      const subject = `[LiveChat] Hỗ trợ trực tuyến: ${cleanName}`;
      const description = input.message?.trim() || "Khách hàng mở phiên LiveChat từ Storefront";

      await this.database.query(
        `INSERT INTO support_tickets (
           id, customer_id, subject, description, priority, status, version, created_by_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'normal', 'new', 1, 'livechat-storefront', NOW(), NOW())`,
        [ticketId, customerId, subject, description],
      );

      await this.database.query(
        `INSERT INTO support_ticket_events (
           id, ticket_id, actor_id, from_status, to_status, source, idempotency_key, occurred_at
         ) VALUES ($1, $2, 'livechat-storefront', 'new', 'new', 'manual', $3, NOW())`,
        [this.generateId(), ticketId, `init_livechat:${ticketId}`],
      );
    }

    // 3. If initial message provided, append and trigger AI auto-response
    if (input.message?.trim()) {
      await this.appendCustomerMessage(ticketId, input.message.trim(), cleanName, cleanEmail);
    }

    // 4. Return current session details and message history
    return this.getSession(ticketId);
  }

  public async appendCustomerMessage(
    ticketId: string,
    body: string,
    customerName?: string,
    customerEmail?: string,
  ): Promise<SupportMessageDto> {
    const messageId = this.generateId();
    const createdAt = this.now();

    await this.database.query(
      `INSERT INTO support_ticket_messages (id, ticket_id, author_id, body, created_at)
       VALUES ($1, $2, 'customer', $3, NOW())`,
      [messageId, ticketId, body],
    );

    const messageView: SupportMessageDto = {
      id: messageId,
      authorId: "customer",
      body,
      createdAt,
    };

    // Broadcast customer message to staff (Console)
    this.realtimeBroadcaster.broadcast(ticketId, {
      type: "message_created",
      ticketId,
      message: messageView,
    });

    // Asynchronously trigger AI assistant auto-reply
    void this.triggerAiAssistantReply(ticketId, body, customerName, customerEmail);

    return messageView;
  }

  public async getSession(ticketId: string): Promise<LivechatSessionResponse> {
    const ticketRes = await this.database.query<{
      id: string;
      customer_id: string;
      full_name: string;
      email: string;
    }>(
      `SELECT t.id, t.customer_id, COALESCE(c.full_name, 'Khách hàng') as full_name, COALESCE(c.email, '') as email
       FROM support_tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.id = $1`,
      [ticketId],
    );

    if (ticketRes.rows.length === 0) {
      throw new Error(`Livechat ticket ${ticketId} not found`);
    }

    const row = ticketRes.rows[0];
    const msgsRes = await this.database.query<{
      id: string;
      ticket_id: string;
      author_id: string;
      body: string;
      created_at: Date;
    }>(
      `SELECT id, ticket_id, author_id, body, created_at
       FROM support_ticket_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId],
    );

    const messages: SupportMessageDto[] = msgsRes.rows.map((m) => ({
      id: m.id,
      authorId: m.author_id,
      body: m.body,
      createdAt: m.created_at.toISOString(),
    }));

    return {
      sessionId: row.id,
      ticketId: row.id,
      customerId: row.customer_id,
      customerName: row.full_name,
      customerEmail: row.email,
      messages,
    };
  }

  private async triggerAiAssistantReply(
    ticketId: string,
    currentMessage: string,
    customerName?: string,
    customerEmail?: string,
  ): Promise<void> {
    try {
      // Check if ticket is assigned to a human staff who might be active
      const ticketInfo = await this.database.query<{
        assignee_id: string | null;
        subject: string;
        priority: string;
      }>(
        `SELECT assignee_id, subject, priority FROM support_tickets WHERE id = $1`,
        [ticketId],
      );

      const ticket = ticketInfo.rows[0];
      const name = customerName || "Quý khách";

      // Load recent message history for context
      const historyRes = await this.database.query<{
        author_id: string;
        body: string;
      }>(
        `SELECT author_id, body FROM support_ticket_messages WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 6`,
        [ticketId],
      );

      const history = historyRes.rows.reverse().map((r) => ({
        authorId: r.author_id,
        body: r.body,
      }));

      // Generate AI response
      const aiResult = await this.aiAssistant.generateReply({
        customerName: name,
        customerEmail,
        currentMessage,
        ticketSubject: ticket?.subject,
        history,
      });

      // Save AI reply in DB
      const aiMessageId = this.generateId();
      const createdAt = this.now();

      await this.database.query(
        `INSERT INTO support_ticket_messages (id, ticket_id, author_id, body, created_at)
         VALUES ($1, $2, 'support-ai', $3, NOW())`,
        [aiMessageId, ticketId, aiResult.reply],
      );

      // If critical, log critical event
      if (aiResult.isCritical) {
        console.log(`[SupportLivechatService] Critical issue detected for ticket ${ticketId}, category: ${aiResult.category}`);
      }

      const aiMessageView: SupportMessageDto = {
        id: aiMessageId,
        authorId: "support-ai",
        body: aiResult.reply,
        createdAt,
      };

      // Broadcast AI reply via SSE to customer and staff
      this.realtimeBroadcaster.broadcast(ticketId, {
        type: "message_created",
        ticketId,
        message: aiMessageView,
      });
    } catch (err) {
      console.error("[SupportLivechatService] Error generating AI assistant reply:", err);
    }
  }
}
