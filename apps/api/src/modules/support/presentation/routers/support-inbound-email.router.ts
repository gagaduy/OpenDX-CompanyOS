// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { Router } from "express";
import type { SupportInboundEmailController } from "../controllers/support-inbound-email.controller";

export function createSupportInboundEmailRouter(controller: SupportInboundEmailController): Router {
  const router = Router();
  router.post("/support/email/inbound", express.json({ limit: "1mb" }), (req, res) => controller.handleInboundEmail(req, res));
  return router;
}
