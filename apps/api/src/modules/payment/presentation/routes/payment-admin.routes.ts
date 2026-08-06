// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { Router, type RequestHandler } from "express";
import {
  createAuditedRoleGuard,
  type DeniedAuditContext,
} from "../../../../shared/auth/audited-role-guard.middleware";
import type { PaymentAdminController } from "../controllers/payment-admin.controller";

const paymentRoles = ["administrator", "finance_operator"] as const;

export function createPaymentAdminRouter(
  controller: PaymentAdminController,
  authenticate: RequestHandler,
  appendDenied: (context: DeniedAuditContext) => Promise<void>,
): Router {
  const router = Router();
  const read = createAuditedRoleGuard({
    allowedRoles: paymentRoles,
    action: "payment.read.denied",
    resourceId: (request) => paymentResource(request.params.paymentId),
    appendDenied,
  });
  const reconcile = createAuditedRoleGuard({
    allowedRoles: paymentRoles,
    action: "payment.reconcile.denied",
    resourceId: (request) => paymentResource(request.params.paymentId),
    appendDenied,
  });
  router.get("/", authenticate, read, controller.list);
  router.get("/:paymentId", authenticate, read, controller.get);
  router.post(
    "/:paymentId/reconciliations",
    authenticate,
    reconcile,
    controller.reconcile,
  );
  return router;
}

function paymentResource(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "payments";
}
