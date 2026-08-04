// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { CompanyOperatingCoreRepository } from "./repository";

export function createCompanyOperatingCoreRouter(
  repository: CompanyOperatingCoreRepository,
): Router {
  const router = Router();

  router.get("/operating-core", (_request, response) => {
    response.json(repository.getSnapshot());
  });

  router.get("/departments", (_request, response) => {
    response.json({ data: repository.listDepartments() });
  });

  router.get("/tasks", (_request, response) => {
    response.json({ data: repository.listTasks() });
  });

  router.get("/events", (_request, response) => {
    response.json({ data: repository.listEvents() });
  });

  router.get("/approvals", (_request, response) => {
    response.json({ data: repository.listApprovals() });
  });

  return router;
}
