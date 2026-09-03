// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import type { AiSupportService } from "../../application/services/implementations/ai-support.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SupportInboundEmailController {
  constructor(
    private readonly database: Pool,
    private readonly aiSupportService: AiSupportService,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async handleInboundEmail(req: Request, res: Response): Promise<void> {
    const { from, name, subject, body, orderId } = req.body || {};

    if (!from || typeof from !== "string" || !EMAIL_REGEX.test(from.trim())) {
      res.status(400).json({ error: "INVALID_EMAIL", message: "A valid 'from' email address is required." });
      return;
    }

    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      res.status(400).json({ error: "INVALID_SUBJECT", message: "'subject' is required." });
      return;
    }

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      res.status(400).json({ error: "INVALID_BODY", message: "'body' is required." });
      return;
    }

    const cleanEmail = from.trim().toLowerCase();
    const cleanName = (name && typeof name === "string" ? name.trim() : "") || cleanEmail.split("@")[0];
    const cleanSubject = subject.trim().slice(0, 255);
    const cleanBody = body.trim().slice(0, 10000);
    const cleanOrderId = orderId && typeof orderId === "string" ? orderId.trim() : null;

    // Invert priority heuristics
    const lowerText = `${cleanSubject} ${cleanBody}`.toLowerCase();
    const isUrgent = lowerText.includes("khẩn") || lowerText.includes("gấp") || lowerText.includes("ngay lập tức");
    const isHigh = lowerText.includes("trễ") || lowerText.includes("chậm") || lowerText.includes("hỏng") || lowerText.includes("lỗi") || lowerText.includes("hủy");
    const priority = isUrgent ? "urgent" : isHigh ? "high" : "normal";

    try {
      // 1. Resolve or create customer
      let customerId: string;
      const existingCustomer = await this.database.query<{ id: string; full_name: string }>(
        `SELECT id, full_name FROM customers WHERE LOWER(email) = $1 LIMIT 1`,
        [cleanEmail],
      );

      if (existingCustomer.rows.length > 0) {
        customerId = existingCustomer.rows[0].id;
      } else {
        customerId = this.generateId();
        await this.database.query(
          `INSERT INTO customers (id, full_name, email, status, version, created_at, updated_at)
           VALUES ($1, $2, $3, 'active', 1, NOW(), NOW())`,
          [customerId, cleanName, cleanEmail],
        );
      }

      // 2. Insert support ticket
      const ticketId = this.generateId();
      await this.database.query(
        `INSERT INTO support_tickets (
           id, customer_id, order_id, subject, description, priority, status, version, created_by_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'new', 1, 'email-inbound', NOW(), NOW())`,
        [ticketId, customerId, cleanOrderId, cleanSubject, cleanBody, priority],
      );

      // 3. Record event
      const eventId = this.generateId();
      await this.database.query(
        `INSERT INTO support_ticket_events (
           id, ticket_id, actor_id, from_status, to_status, source, occurred_at
         ) VALUES ($1, $2, 'email-inbound', NULL, 'new', 'manual', NOW())`,
        [eventId, ticketId],
      );

      // 4. Trigger AI draft proposal
      let proposalId: string | undefined;
      try {
        const proposal = await this.aiSupportService.generateSupportProposal({
          prompt: `Phản hồi khẩn cấp email khiếu nại khách hàng: "${cleanSubject}"`,
        });
        proposalId = proposal?.id;
      } catch (err) {
        console.error("[SupportInboundEmailController] AI proposal generation error:", err);
      }

      res.status(201).json({
        ticketId,
        customerId,
        customerEmail: cleanEmail,
        subject: cleanSubject,
        priority,
        status: "new",
        proposalId,
      });
    } catch (err: any) {
      console.error("[SupportInboundEmailController] Inbound processing failed:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: err?.message || "Failed to process inbound email" });
    }
  }
}
