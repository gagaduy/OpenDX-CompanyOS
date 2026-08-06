// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import type { PromotionController } from "../controllers/promotion.controller";

export function createPromotionRouter(controller: PromotionController, authenticate: RequestHandler): Router {
  const router = Router();
  const authorize = [authenticate, requireStaffRole("administrator")] as const;
  router.get("/", ...authorize, controller.list);
  router.post("/", ...authorize, controller.create);
  router.patch("/:promotionId", ...authorize, controller.update);
  return router;
}
