// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import { createAuditedRoleGuard, type DeniedAuditContext } from "../../../../shared/auth/audited-role-guard.middleware";
import type { AdminOrderController } from "../controllers/admin-order.controller";
const roles = ["administrator", "operations_manager"] as const;
export function createAdminOrderRouter(controller: AdminOrderController, authenticate: RequestHandler, appendDenied: (context: DeniedAuditContext) => Promise<void>): Router {
  const router = Router();
  const read = createAuditedRoleGuard({ allowedRoles: roles, action: "order.read.denied", resourceId: (request) => parameter(request.params.orderId, "orders"), appendDenied });
  const write = createAuditedRoleGuard({ allowedRoles: roles, action: "order.transition.denied", resourceId: (request) => parameter(request.params.orderId, "order"), appendDenied });
  router.get("/", authenticate, read, controller.list);
  router.get("/:orderId", authenticate, read, controller.get);
  router.post("/:orderId/transitions", authenticate, write, controller.transition);
  return router;
}
function parameter(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
