// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { CompanyOperatingCoreController } from "../controllers/company-operating-core.controller";

export function createCompanyOperatingCoreRouter(
  controller: CompanyOperatingCoreController,
): Router {
  const router = Router();

  router.get("/operating-core", controller.getSnapshot);
  router.get("/departments", controller.listDepartments);
  router.get("/tasks", controller.listTasks);
  router.get("/events", controller.listEvents);
  router.get("/approvals", controller.listApprovals);

  return router;
}
