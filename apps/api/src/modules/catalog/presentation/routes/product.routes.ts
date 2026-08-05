// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import type { ProductController } from "../controllers/product.controller";

export function createProductRouter(
  controller: ProductController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const authorize = [authenticate, requireStaffRole("administrator", "catalog_manager")] as const;
  router.get("/products", ...authorize, controller.list);
  router.post("/products", ...authorize, controller.create);
  router.get("/products/:productId", ...authorize, controller.get);
  router.get("/products/:productId/audit", ...authorize, controller.audit);
  router.patch("/products/:productId", ...authorize, controller.update);
  router.post("/products/:productId/archive", ...authorize, controller.archive);
  return router;
}
