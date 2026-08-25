// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import type { VariantController } from "../controllers/variant.controller";

export function createVariantRouter(
  controller: VariantController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const authorize = [authenticate, requireStaffRole("administrator", "catalog_manager")] as const;
  router.post("/products/:productId/variants", ...authorize, controller.create);
  router.patch("/products/:productId/variants/:variantId", ...authorize, controller.update);
  router.post("/products/:productId/variants/:variantId/archive", ...authorize, controller.archive);
  router.put("/products/:productId/variants/:variantId/price", ...authorize, controller.replacePrice);
  return router;
}
