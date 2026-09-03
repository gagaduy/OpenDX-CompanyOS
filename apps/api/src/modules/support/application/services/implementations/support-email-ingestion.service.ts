// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AiSupportService } from "./ai-support.service";

export interface IngestInboundEmailInput {
  readonly fromEmail: string;
  readonly fromName?: string;
  readonly subject: string;
  readonly bodyText: string;
  readonly ticketId?: string | null;
  readonly orderId?: string | null;
  readonly messageUid?: string;
}

export interface IngestInboundEmailResult {
  readonly action: "ticket_created" | "ticket_reply_appended";
  readonly ticketId: string;
  readonly customerId: string;
  readonly newStatus?: string;
  readonly proposalId?: string;
}

export class SupportEmailIngestionService {
  constructor(
    private readonly database: Pool,
    private readonly aiSupportService?: AiSupportService,
    private readonly generateId: () => string = randomUUID,
  ) {}

  public async ingestEmail(input: IngestInboundEmailInput): Promise<IngestInboundEmailResult> {
    const cleanEmail = input.fromEmail.trim().toLowerCase();
    const cleanName = (input.fromName && input.fromName.trim()) || cleanEmail.split("@")[0];
    const cleanSubject = input.subject.trim().slice(0, 255);
    const cleanBody = input.bodyText.trim().slice(0, 10000);

    // 0. Early UID Idempotency check: Skip if this specific email UID has already been processed
    if (input.messageUid) {
      const existingUid = await this.database.query<{ id: string }>(
        `SELECT id FROM support_ticket_events WHERE idempotency_key = $1 LIMIT 1`,
        [`email_imap_uid:${input.messageUid}`],
      );
      if (existingUid.rows.length > 0) {
        return {
          action: "ticket_reply_appended",
          ticketId: input.ticketId || "",
          customerId: "",
        };
      }
    }

    // 1. Try to find an existing ticket if ticketId reference is provided
    let existingTicket: { id: string; customer_id: string; status: string; version: number; subject: string } | null = null;

    if (input.ticketId) {
      const candidate = input.ticketId.trim().toLowerCase();
      const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
      if (isFullUuid) {
        const res = await this.database.query<{ id: string; customer_id: string; status: string; version: number; subject: string }>(
          `SELECT id, customer_id, status, version, subject FROM support_tickets WHERE id = $1 LIMIT 1`,
          [candidate],
        );
        if (res.rows.length > 0) existingTicket = res.rows[0];
      } else if (/^[0-9a-f]{6,12}$/i.test(candidate)) {
        const res = await this.database.query<{ id: string; customer_id: string; status: string; version: number; subject: string }>(
          `SELECT id, customer_id, status, version, subject FROM support_tickets WHERE id::text ILIKE $1 LIMIT 1`,
          [`${candidate}%`],
        );
        if (res.rows.length > 0) existingTicket = res.rows[0];
      }
    }

    // 2. If ticket exists, append customer reply and reopen/escalate if resolved
    if (existingTicket) {
      const existingMessage = await this.database.query<{ id: string }>(
        `SELECT id FROM support_ticket_messages WHERE ticket_id = $1 AND body = $2 LIMIT 1`,
        [existingTicket.id, cleanBody],
      );
      if (existingMessage.rows.length > 0) {
        if (input.messageUid) {
          const eventId = this.generateId();
          await this.database.query(
            `INSERT INTO support_ticket_events (
               id, ticket_id, actor_id, from_status, to_status, source, idempotency_key, occurred_at
             ) VALUES ($1, $2, 'customer-email', $3, $3, 'manual', $4, NOW())`,
            [eventId, existingTicket.id, existingTicket.status, `email_imap_uid:${input.messageUid}`],
          );
        }
        return {
          action: "ticket_reply_appended",
          ticketId: existingTicket.id,
          customerId: existingTicket.customer_id,
          newStatus: existingTicket.status,
        };
      }

      const messageId = this.generateId();
      await this.database.query(
        `INSERT INTO support_ticket_messages (id, ticket_id, author_id, body, created_at)
         VALUES ($1, $2, 'customer', $3, NOW())`,
        [messageId, existingTicket.id, cleanBody],
      );

      let targetStatus = existingTicket.status;
      if (existingTicket.status === "resolved") {
        targetStatus = "in_progress";
        await this.database.query(
          `UPDATE support_tickets 
           SET status = 'in_progress', 
               updated_at = NOW(), 
               version = version + 1,
               sla_stopped_seconds = sla_stopped_seconds + floor(extract(epoch FROM NOW() - sla_stopped_at))::integer,
               sla_stopped_at = NULL
           WHERE id = $1`,
          [existingTicket.id],
        );
      } else if (existingTicket.status === "closed") {
        targetStatus = "in_progress";
        await this.database.query(
          `UPDATE support_tickets 
           SET status = 'in_progress', 
               updated_at = NOW(), 
               version = version + 1,
               closed_at = NULL
           WHERE id = $1`,
          [existingTicket.id],
        );
      }

      const eventId = this.generateId();
      const idempotencyKey = input.messageUid ? `email_imap_uid:${input.messageUid}` : `email_reply:${existingTicket.id}:${Date.now()}`;
      await this.database.query(
        `INSERT INTO support_ticket_events (
           id, ticket_id, actor_id, from_status, to_status, source, idempotency_key, occurred_at
         ) VALUES ($1, $2, 'customer-email', $3, $4, 'manual', $5, NOW())`,
        [eventId, existingTicket.id, existingTicket.status, targetStatus, idempotencyKey],
      );

      let proposalId: string | undefined;
      if (this.aiSupportService) {
        try {
          const proposal = await this.aiSupportService.generateSupportProposal({
            prompt: `Khách hàng phản hồi lại yêu cầu #${existingTicket.id.slice(0, 8)} (${existingTicket.subject}): "${cleanBody}". Cần phương án giải quyết và đền bù mới thích đáng.`,
          });
          proposalId = proposal?.id;
        } catch (aiErr) {
          console.error("[SupportEmailIngestionService] AI Proposal generation error on reply:", aiErr);
        }
      }

      return {
        action: "ticket_reply_appended",
        ticketId: existingTicket.id,
        customerId: existingTicket.customer_id,
        newStatus: targetStatus,
        proposalId,
      };
    }

    // 3. Otherwise, resolve customer and create a new ticket
    let customerId: string;
    const existingCustomer = await this.database.query<{ id: string }>(
      `SELECT id FROM customers WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail],
    );

    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
    } else {
      customerId = this.generateId();
      await this.database.query(
        `INSERT INTO customers (id, full_name, email, email_verified_at, status, version, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), 'active', 1, NOW(), NOW())`,
        [customerId, cleanName, cleanEmail],
      );
    }

    let verifiedOrderId: string | null = null;
    if (input.orderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.orderId.trim())) {
      const orderExists = await this.database.query(`SELECT id FROM orders WHERE id = $1 LIMIT 1`, [input.orderId.trim()]);
      if (orderExists.rows.length > 0) verifiedOrderId = input.orderId.trim();
    }

    const lowerText = `${cleanSubject} ${cleanBody}`.toLowerCase();
    const isUrgent = lowerText.includes("khẩn") || lowerText.includes("gấp") || lowerText.includes("ngay lập tức");
    const isHigh = lowerText.includes("trễ") || lowerText.includes("chậm") || lowerText.includes("hỏng") || lowerText.includes("lỗi") || lowerText.includes("hủy");
    const priority = isUrgent ? "urgent" : isHigh ? "high" : "normal";

    const ticketId = this.generateId();
    await this.database.query(
      `INSERT INTO support_tickets (
         id, customer_id, order_id, subject, description, priority, status, version, created_by_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'new', 1, 'email-inbound', NOW(), NOW())`,
      [ticketId, customerId, verifiedOrderId, cleanSubject, cleanBody, priority],
    );

    const eventId = this.generateId();
    await this.database.query(
      `INSERT INTO support_ticket_events (
         id, ticket_id, actor_id, from_status, to_status, source, idempotency_key, occurred_at
       ) VALUES ($1, $2, 'email-inbound', 'new', 'new', 'manual', $3, NOW())`,
      [eventId, ticketId, `email_inbound:${ticketId}`],
    );

    let proposalId: string | undefined;
    if (this.aiSupportService) {
      try {
        const proposal = await this.aiSupportService.generateSupportProposal({
          prompt: `Phản hồi khẩn cấp email khiếu nại khách hàng: "${cleanSubject}"`,
        });
        proposalId = proposal?.id;
      } catch (aiErr) {
        console.error("[SupportEmailIngestionService] AI Proposal generation error on new ticket:", aiErr);
      }
    }

    return {
      action: "ticket_created",
      ticketId,
      customerId,
      proposalId,
    };
  }
}
