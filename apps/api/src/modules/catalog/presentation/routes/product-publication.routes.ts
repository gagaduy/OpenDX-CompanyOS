// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import { createAuditedRoleGuard, type DeniedAuditContext } from "../../../../shared/auth/audited-role-guard.middleware";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import type { ProductPublicationController } from "../controllers/product-publication.controller";

const publisherRoles = ["administrator", "catalog_manager"] as const;

export function createProductPublicationRouter(
  controller: ProductPublicationController,
  authenticate: RequestHandler,
  appendDenied: (context: DeniedAuditContext) => Promise<void>,
): Router {
  const router = Router();
  const guard = (action: string) => createAuditedRoleGuard({
    allowedRoles: publisherRoles,
    action,
    resourceId: (request) => request.params.productId as string,
    appendDenied,
  });
  router.get("/products/:productId/publication-readiness", authenticate, requireStaffRole(...publisherRoles), controller.readiness);
  router.post("/products/:productId/publish", authenticate, guard("catalog.product.published"), controller.publish);
  router.post("/products/:productId/unpublish", authenticate, guard("catalog.product.unpublished"), controller.unpublish);
  return router;
}
