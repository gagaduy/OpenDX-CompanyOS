// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { RequestHandler } from "express";
import type { AiMerchandisingController } from "../controllers/ai-merchandising.controller";

export function createAiMerchandisingRouter(
  controller: AiMerchandisingController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.post("/ai-merchandising/generate-proposal", authenticate, controller.generateProposal);
  router.get("/ai-merchandising/proposals/:proposalId", authenticate, controller.getProposal);
  router.post("/ai-merchandising/apply-proposal", authenticate, controller.applyProposal);

  return router;
}
