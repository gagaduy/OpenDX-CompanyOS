// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type Request, type RequestHandler } from "express";
import {
  createAuditedRoleGuard,
  type DeniedAuditContext,
} from "../../../../shared/auth/audited-role-guard.middleware";
import type { ReportingController } from "../controllers/reporting.controller";

const allowedRoles = ["administrator", "executive_viewer"] as const;

export function createReportingRouter(
  controller: ReportingController,
  authenticate: RequestHandler,
  appendDenied: (context: DeniedAuditContext) => Promise<void>,
): Router {
  const router = Router();
  const authorize = createAuditedRoleGuard({
    allowedRoles,
    action: "reporting.access.denied",
    resourceId,
    appendDenied,
  });

  router.get("/commerce", authenticate, authorize, controller.getCommerce);
  router.get("/products", authenticate, authorize, controller.getProducts);
  router.get("/customers", authenticate, authorize, controller.getCustomers);
  router.get("/operations", authenticate, authorize, controller.getOperations);
  return router;
}

function resourceId(request: Request): string {
  const segment = request.path.split("/").filter(Boolean)[0];
  return segment ?? "reporting";
}
