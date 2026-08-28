// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import { authenticateStaff, type StaffTokenVerifier } from "../../../../shared/auth/staff-auth.middleware";
import { requireStaffRole } from "../../../../shared/auth/require-role.middleware";
import type { MarketingController } from "../controllers/marketing.controller";

export interface CreateMarketingRouterOptions {
  readonly controller: MarketingController;
  readonly staffTokenVerifier: StaffTokenVerifier;
}

export function createMarketingAdminRouter(options: CreateMarketingRouterOptions): Router {
  const router = Router();
  const { controller, staffTokenVerifier } = options;

  router.use(authenticateStaff(staffTokenVerifier));

  const operatorRoles = ["administrator", "agentic_operator", "agentic_governance_admin"] as const;
  const viewerRoles = [
    "administrator",
    "agentic_operator",
    "agentic_approver",
    "agentic_governance_admin",
    "agentic_auditor",
  ] as const;

  const approverRoles = ["administrator", "agentic_approver", "agentic_governance_admin"] as const;
  const operatorOrApproverRoles = [
    "administrator",
    "agentic_operator",
    "agentic_approver",
    "agentic_governance_admin",
  ] as const;

  router.post("/campaigns", requireStaffRole(...operatorRoles), controller.createCampaign);
  router.get("/campaigns", requireStaffRole(...viewerRoles), controller.listCampaigns);
  router.get("/campaigns/:campaignId", requireStaffRole(...viewerRoles), controller.getCampaign);
  router.post("/campaigns/:campaignId/ready", requireStaffRole(...operatorRoles), controller.markReady);
  router.post("/campaigns/:campaignId/cancel", requireStaffRole(...operatorRoles), controller.cancelCampaign);
  router.post("/campaigns/:campaignId/approve", requireStaffRole(...approverRoles), controller.approveCampaign);
  router.post("/campaigns/:campaignId/retry-publication", requireStaffRole(...approverRoles), controller.retryPublication);
  router.post("/campaigns/:campaignId/request-revision", requireStaffRole(...operatorOrApproverRoles), controller.requestRevision);
  router.post("/campaigns/:campaignId/quality-feedback", requireStaffRole(...operatorOrApproverRoles), controller.qualityFeedback);
  router.post("/campaigns/:campaignId/generate-deliverables", requireStaffRole(...operatorRoles), controller.generateDeliverables);
  router.get("/campaigns/:campaignId/artifacts", requireStaffRole(...viewerRoles), controller.listArtifacts);
  router.get("/artifacts/:artifactId/download", requireStaffRole(...viewerRoles), controller.downloadArtifact);

  return router;
}
