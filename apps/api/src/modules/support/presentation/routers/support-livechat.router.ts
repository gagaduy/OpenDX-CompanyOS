// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { Request, Response } from "express";
import type { SupportLivechatService } from "../../application/services/implementations/support-livechat.service";
import type { RealtimeBroadcasterPort, SupportRealtimeEvent } from "../../application/ports/realtime-broadcaster.port";

export function createSupportLivechatRouter(
  livechatService: SupportLivechatService,
  realtimeBroadcaster: RealtimeBroadcasterPort,
): Router {
  const router = Router();

  // 1. Initialize customer live chat session
  router.post("/init", async (req: Request, res: Response) => {
    try {
      const { email, fullName, message } = req.body || {};
      if (!email || typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ error: "Invalid email address" });
        return;
      }

      const session = await livechatService.initSession({
        email,
        fullName: typeof fullName === "string" ? fullName : email.split("@")[0],
        message: typeof message === "string" ? message : undefined,
      });

      res.status(200).json({ success: true, session });
    } catch (err: any) {
      console.error("[SupportLivechatRouter] Error initializing session:", err);
      res.status(500).json({ error: err.message || "Failed to initialize livechat session" });
    }
  });

  // 2. Customer posts a message in active session
  router.post("/:sessionId/messages", async (req: Request, res: Response) => {
    try {
      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
      const { body } = req.body || {};

      if (!body || typeof body !== "string" || body.trim().length === 0) {
        res.status(400).json({ error: "Message body cannot be empty" });
        return;
      }

      const message = await livechatService.appendCustomerMessage(sessionId, body.trim());
      res.status(201).json({ success: true, message });
    } catch (err: any) {
      console.error("[SupportLivechatRouter] Error posting message:", err);
      res.status(500).json({ error: err.message || "Failed to post message" });
    }
  });

  // 3. Real-time Server-Sent Events (SSE) stream for customer
  router.get("/:sessionId/events", async (req: Request, res: Response) => {
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    // Send initial connected payload
    res.write(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);

    // Keep connection alive with periodic comment pings
    const keepAliveTimer = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15_000);

    // Subscribe to ticket events
    const unsubscribe = realtimeBroadcaster.subscribe(sessionId, (event: SupportRealtimeEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      unsubscribe();
      res.end();
    });
  });

  return router;
}
