// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import type { CategoryController } from "../controllers/category.controller";

export function createCategoryRouter(
  controller: CategoryController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(
    authenticate,
    requireStaffRole("administrator", "catalog_manager"),
  );
  router.get("/categories", controller.list);
  router.post("/categories", controller.create);
  router.patch("/categories/:categoryId", controller.update);
  router.post("/categories/:categoryId/archive", controller.archive);
  return router;
}
