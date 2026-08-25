// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type Request, type RequestHandler } from "express";
import { createAuditedRoleGuard, type DeniedAuditContext } from "../../../../shared/auth/audited-role-guard.middleware";
import type { CrmController } from "../controllers/crm.controller";

const roles = ["administrator", "crm_operator"] as const;

export function createCrmRouter(
  controller: CrmController,
  authenticate: RequestHandler,
  appendDenied: (context: DeniedAuditContext) => Promise<void>,
): Router {
  const router = Router();
  const authorize = createAuditedRoleGuard({
    allowedRoles: roles,
    action: "crm.access.denied",
    resourceId,
    appendDenied,
  });

  router.get("/", authenticate, authorize, controller.searchCustomers);
  router.get("/segments", authenticate, authorize, controller.listSegments);
  router.get("/segments/:segmentId/customers", authenticate, authorize, controller.listSegmentCustomers);
  router.get("/:customerId", authenticate, authorize, controller.getCustomer);
  router.get("/:customerId/notes", authenticate, authorize, controller.listNotes);
  router.post("/:customerId/notes", authenticate, authorize, controller.createNote);
  router.get("/:customerId/followups", authenticate, authorize, controller.listFollowups);
  router.post("/:customerId/followups", authenticate, authorize, controller.createFollowup);
  router.patch("/:customerId/followups/:followupId", authenticate, authorize, controller.updateFollowup);
  return router;
}

function resourceId(request: Request): string {
  for (const value of [request.params.followupId, request.params.customerId, request.params.segmentId]) {
    if (typeof value === "string") return value;
  }
  return request.path.startsWith("/segments") ? "segments" : "customers";
}
