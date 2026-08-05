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
  router.use(authenticate, requireStaffRole("administrator", "catalog_manager"));
  router.get("/products", controller.list);
  router.post("/products", controller.create);
  router.get("/products/:productId", controller.get);
  router.patch("/products/:productId", controller.update);
  router.post("/products/:productId/archive", controller.archive);
  return router;
}
