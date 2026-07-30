// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { CompanyId } from "@opendx/domain";
import type { CompanyOperatingCoreRepository } from "./repository";

const companyNotFound = {
  error: {
    code: "company_not_found",
    message: "Company was not found",
  },
};

export function createCompanyOperatingCoreRouter(
  repository: CompanyOperatingCoreRepository,
): Router {
  const router = Router();

  router.get("/companies/:companyId/operating-core", (request, response) => {
    const companyId = request.params.companyId as CompanyId;
    const snapshot = repository.findSnapshotByCompanyId(companyId);

    if (!snapshot) {
      response.status(404).json(companyNotFound);
      return;
    }

    response.json(snapshot);
  });

  router.get("/companies/:companyId/departments", (request, response) => {
    const companyId = request.params.companyId as CompanyId;

    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }

    response.json({ data: repository.findDepartmentsByCompanyId(companyId) });
  });

  router.get("/companies/:companyId/tasks", (request, response) => {
    const companyId = request.params.companyId as CompanyId;

    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }

    response.json({ data: repository.findTasksByCompanyId(companyId) });
  });

  router.get("/companies/:companyId/events", (request, response) => {
    const companyId = request.params.companyId as CompanyId;

    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }

    response.json({ data: repository.findEventsByCompanyId(companyId) });
  });

  router.get("/companies/:companyId/approvals", (request, response) => {
    const companyId = request.params.companyId as CompanyId;

    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }

    response.json({ data: repository.findApprovalsByCompanyId(companyId) });
  });

  return router;
}
