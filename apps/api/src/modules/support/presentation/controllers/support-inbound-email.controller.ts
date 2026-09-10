// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import type { AiSupportService } from "../../application/services/implementations/ai-support.service";
import { SupportEmailIngestionService } from "../../application/services/implementations/support-email-ingestion.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SupportInboundEmailController {
  private readonly ingestionService: SupportEmailIngestionService;

  constructor(
    private readonly database: Pool,
    private readonly aiSupportService: AiSupportService,
    ingestionService?: SupportEmailIngestionService,
  ) {
    this.ingestionService = ingestionService || new SupportEmailIngestionService(this.database, this.aiSupportService);
  }

  async handleInboundEmail(req: Request, res: Response): Promise<void> {
    const { from, name, subject, body, orderId, ticketId } = req.body || {};

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
    const cleanTicketId = ticketId && typeof ticketId === "string" ? ticketId.trim() : null;

    try {
      const result = await this.ingestionService.ingestEmail({
        fromEmail: cleanEmail,
        fromName: cleanName,
        subject: cleanSubject,
        bodyText: cleanBody,
        orderId: cleanOrderId,
        ticketId: cleanTicketId,
      });

      res.status(201).json({
        action: result.action,
        ticketId: result.ticketId,
        customerId: result.customerId,
        newStatus: result.newStatus,
        customerEmail: cleanEmail,
        subject: cleanSubject,
        proposalId: result.proposalId,
      });
    } catch (err) {
      console.error("[SupportInboundEmailController] Error handling inbound email:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to process inbound support email." });
    }
  }
}
