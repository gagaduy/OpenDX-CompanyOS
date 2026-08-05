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
  const authorize = [
    authenticate,
    requireStaffRole("administrator", "catalog_manager"),
  ] as const;
  router.get("/categories", ...authorize, controller.list);
  router.post("/categories", ...authorize, controller.create);
  router.patch("/categories/:categoryId", ...authorize, controller.update);
  router.post("/categories/:categoryId/archive", ...authorize, controller.archive);
  return router;
}
