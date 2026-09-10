// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { SupportContext } from "../../application/dtos/support.dto";
import type { SupportAttachmentServiceContract } from "../../application/services/interfaces/support-attachment.service";
import type { SupportServiceContract } from "../../application/services/interfaces/support.service";
import type { AiSupportService } from "../../application/services/implementations/ai-support.service";
import {
  parseAttachmentId,
  parseClaim,
  parseCreate,
  parseMessage,
  parsePage,
  parseReassign,
  parseTicketId,
  parseTransition,
} from "../validators/support.validator";

export class SupportController {
  constructor(
    private readonly service: SupportServiceContract,
    private readonly attachments?: SupportAttachmentServiceContract,
    private readonly aiService?: AiSupportService,
  ) {}

  readonly list: RequestHandler = async (q, r, n) => {
    try {
      r.json(successResponse("Support tickets retrieved", await this.service.list(parsePage(q.query), ctx(r.locals))));
    } catch (e) {
      n(e);
    }
  };

  readonly create: RequestHandler = async (q, r, n) => {
    try {
      r.status(201).json(successResponse("Support ticket created", await this.service.create(parseCreate(q.body), ctx(r.locals))));
    } catch (e) {
      n(e);
    }
  };

  readonly detail: RequestHandler = async (q, r, n) => {
    try {
      r.json(successResponse("Support ticket retrieved", await this.service.detail(parseTicketId(q.params.ticketId), ctx(r.locals))));
    } catch (e) {
      n(e);
    }
  };

  readonly claim: RequestHandler = async (q, r, n) => {
    try {
      r.json(successResponse("Support ticket claimed", await this.service.claim(parseTicketId(q.params.ticketId), parseClaim(q.body).version, ctx(r.locals))));
    } catch (e) {
      n(e);
    }
  };

  readonly transition: RequestHandler = async (q, r, n) => {
    try {
      const body = q.body as Record<string, unknown>;
      const id = parseTicketId(q.params.ticketId);
      const context = ctx(r.locals);
      const result =
        body.status === undefined
          ? await this.service.reassign(id, parseReassign(body), context)
          : await this.service.transition(id, parseTransition(body), context);
      r.json(successResponse("Support ticket updated", result));
    } catch (e) {
      n(e);
    }
  };

  readonly message: RequestHandler = async (q, r, n) => {
    try {
      r.status(201).json(
        successResponse("Support ticket message created", await this.service.appendMessage(parseTicketId(q.params.ticketId), parseMessage(q.body).body, ctx(r.locals))),
      );
    } catch (e) {
      n(e);
    }
  };

  readonly uploadAttachment: RequestHandler = async (q, r, n) => {
    try {
      if (this.attachments === undefined) throw new ApplicationError(503, "ATTACHMENT_SCAN_FAILED", "Support attachments are unavailable");
      if (q.file === undefined) throw new ApplicationError(400, "VALIDATION_ERROR", "Attachment file is required");
      const attachment = await this.attachments.upload(
        parseTicketId(q.params.ticketId),
        { originalFilename: q.file.originalname, mediaType: q.file.mimetype, bytes: q.file.buffer },
        ctx(r.locals),
      );
      r.status(201).json(successResponse("Support attachment uploaded", attachment));
    } catch (e) {
      n(e);
    }
  };

  readonly downloadAttachment: RequestHandler = async (q, r, n) => {
    try {
      if (this.attachments === undefined) throw new ApplicationError(503, "ATTACHMENT_SCAN_FAILED", "Support attachments are unavailable");
      const result = await this.attachments.download(parseTicketId(q.params.ticketId), parseAttachmentId(q.params.attachmentId), ctx(r.locals));
      r.type(result.attachment.mediaType);
      r.setHeader("content-disposition", `attachment; filename="${result.attachment.originalFilename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
      result.content.pipe(r);
    } catch (e) {
      n(e);
    }
  };

  // AI Support & CRM Endpoints
  readonly generateAiProposal: RequestHandler = async (q, r, n) => {
    try {
      if (!this.aiService) throw new ApplicationError(503, "DEPENDENCY_UNAVAILABLE", "AI Support service is unavailable");
      const proposal = await this.aiService.generateSupportProposal({ prompt: String(q.body?.prompt || "") });
      r.json(successResponse("Support proposal generated", proposal));
    } catch (e) {
      n(e);
    }
  };

  readonly getAiProposalDocx: RequestHandler = async (q, r, n) => {
    try {
      if (!this.aiService) throw new ApplicationError(503, "DEPENDENCY_UNAVAILABLE", "AI Support service is unavailable");
      const docx = this.aiService.getProposalDocx(String(q.params.proposalId));
      r.type(docx.mediaType);
      r.setHeader("content-disposition", `attachment; filename="${docx.filename}"`);
      r.send(docx.buffer);
    } catch (e) {
      n(e);
    }
  };

  readonly applyAiProposal: RequestHandler = async (q, r, n) => {
    try {
      if (!this.aiService) throw new ApplicationError(503, "DEPENDENCY_UNAVAILABLE", "AI Support service is unavailable");
      const items = Array.isArray(q.body?.items) ? q.body.items : [];
      const result = await this.aiService.applySupportProposal(String(q.params.proposalId), { items });
      r.json(successResponse("Support proposal applied", result));
    } catch (e) {
      n(e);
    }
  };

  readonly generateAiDraftReply: RequestHandler = async (q, r, n) => {
    try {
      if (!this.aiService) throw new ApplicationError(503, "DEPENDENCY_UNAVAILABLE", "AI Support service is unavailable");
      const ticketId = parseTicketId(q.params.ticketId);
      const draft = await this.aiService.generateDraftReply(ticketId);
      r.json(successResponse("AI draft reply generated", { draft }));
    } catch (e) {
      n(e);
    }
  };
}

function ctx(l: Record<string, unknown>): SupportContext {
  const p = l.staffPrincipal as StaffPrincipal;
  return {
    actorId: p?.subject ?? "staff-system",
    roles: (p?.roles ?? []).filter((r): r is "administrator" | "crm_operator" | "support_operator" => r === "administrator" || r === "crm_operator" || r === "support_operator"),
    correlationId: (l.correlationId as string) || "corr-default",
  };
}
