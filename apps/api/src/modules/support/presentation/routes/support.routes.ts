// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import multer, { MulterError } from "multer";
import { ApplicationError } from "../../../../shared/http/application-error";
import { createAuditedRoleGuard, type DeniedAuditContext } from "../../../../shared/auth/audited-role-guard.middleware";
import type { SupportController } from "../controllers/support.controller";
import type { RealtimeBroadcasterPort, SupportRealtimeEvent } from "../../application/ports/realtime-broadcaster.port";

export function createSupportRouter(
  c: SupportController,
  a: RequestHandler,
  denied: (x: DeniedAuditContext) => Promise<void>,
  maximumAttachmentBytes = 25 * 1024 * 1024,
  realtimeBroadcaster?: RealtimeBroadcasterPort,
) {
  const r = Router();
  const guard = createAuditedRoleGuard({
    allowedRoles: ["administrator", "crm_operator", "support_operator"],
    action: "support.access.denied",
    resourceId: (q) => (typeof q.params.ticketId === "string" ? q.params.ticketId : "tickets"),
    appendDenied: denied,
  });
  const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: maximumAttachmentBytes, files: 1 } }).single("file");
  const parseUpload: RequestHandler = (q, s, n) => {
    parser(q, s, (e) => {
      if (e instanceof MulterError && e.code === "LIMIT_FILE_SIZE") {
        n(new ApplicationError(413, "ATTACHMENT_TOO_LARGE", "Attachment exceeds the upload limit"));
        return;
      }
      n(e);
    });
  };

  r.use(a);

  // AI Support & CRM Endpoints (Open to authenticated staff)
  r.post("/ai-proposal", c.generateAiProposal);
  r.get("/ai-proposal/:proposalId/docx", c.getAiProposalDocx);
  r.post("/ai-proposal/:proposalId/apply", c.applyAiProposal);

  // Core Ticket CRUD with Role Guard
  r.get("/", guard, c.list);
  r.post("/", guard, c.create);
  r.get("/:ticketId", guard, c.detail);
  r.get("/:ticketId/ai-draft", guard, c.generateAiDraftReply);
  r.post("/:ticketId/claim", guard, c.claim);
  r.patch("/:ticketId", guard, c.transition);
  r.post("/:ticketId/messages", guard, c.message);
  r.post("/:ticketId/attachments", guard, parseUpload, c.uploadAttachment);
  r.get("/:ticketId/attachments/:attachmentId/content", guard, c.downloadAttachment);
  r.get("/:ticketId/events", guard, (req, res) => {
    const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : req.params.ticketId;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: "connected", ticketId })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15_000);

    const unsub = realtimeBroadcaster?.subscribe(ticketId, (event: SupportRealtimeEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      clearInterval(keepAlive);
      unsub?.();
      res.end();
    });
  });

  return r;
}
