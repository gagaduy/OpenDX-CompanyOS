// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type RequestHandler } from "express";
import { createAuditedRoleGuard, type DeniedAuditContext } from "../../../../shared/auth/audited-role-guard.middleware";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import type { InventoryController } from "../controllers/inventory.controller";

const readerRoles = ["administrator", "catalog_manager", "inventory_manager"] as const;
const writerRoles = ["administrator", "inventory_manager"] as const;

export function createInventoryRouter(
  controller: InventoryController,
  authenticate: RequestHandler,
  appendDenied: (context: DeniedAuditContext) => Promise<void>,
): Router {
  const router = Router();
  const read = [authenticate, requireStaffRole(...readerRoles)] as const;
  const receiptGuard = createAuditedRoleGuard({
    allowedRoles: writerRoles,
    action: "inventory.stock.received",
    resourceId: (request) => typeof request.body?.variantId === "string" ? request.body.variantId : "inventory",
    appendDenied,
  });
  const adjustmentGuard = createAuditedRoleGuard({
    allowedRoles: writerRoles,
    action: "inventory.stock.adjusted",
    resourceId: (request) => request.params.inventoryItemId as string,
    appendDenied,
  });
  router.get("/items", ...read, controller.list);
  router.get("/items/:inventoryItemId", ...read, controller.get);
  router.get("/items/:inventoryItemId/movements", ...read, controller.movements);
  router.post("/receipts", authenticate, receiptGuard, controller.receive);
  router.post("/items/:inventoryItemId/adjust", authenticate, adjustmentGuard, controller.adjust);
  router.post("/ai-proposal", authenticate, controller.generateAiProposal);
  router.get("/ai-proposal/:proposalId/docx", authenticate, controller.getAiProposalDocx);
  router.post("/ai-proposal/:proposalId/apply", authenticate, controller.applyAiProposal);
  return router;
}
