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
  router.use(authenticate, requireStaffRole("administrator", "catalog_manager"));
  router.post("/products/:productId/variants", controller.create);
  router.patch("/products/:productId/variants/:variantId", controller.update);
  router.post("/products/:productId/variants/:variantId/archive", controller.archive);
  router.put("/products/:productId/variants/:variantId/price", controller.replacePrice);
  return router;
}
