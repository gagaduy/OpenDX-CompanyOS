// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router, type Request, type RequestHandler } from "express";
import { createAuditedRoleGuard, type DeniedAuditContext } from "../../../../shared/auth/audited-role-guard.middleware";
import type { StaffRole } from "../../../../shared/auth/staff-principal";

export interface AgenticControllerHandlers {
  readonly createTask: RequestHandler; readonly listTasks: RequestHandler;
  readonly getTask: RequestHandler; readonly updateTask: RequestHandler;
  readonly readyTask: RequestHandler; readonly cancelTask: RequestHandler;
  readonly listApprovals: RequestHandler; readonly getApproval: RequestHandler;
  readonly decideApproval: RequestHandler; readonly listEmployees: RequestHandler;
  readonly getEmployee: RequestHandler; readonly createRevision: RequestHandler;
  readonly updateRevision: RequestHandler; readonly submitRevision: RequestHandler;
  readonly getRevisionDiff: RequestHandler; readonly decideRevision: RequestHandler;
  readonly createRevocation: RequestHandler; readonly listAudit: RequestHandler;
}

export function createAgenticRouter(
  controller: AgenticControllerHandlers,
  authenticate: RequestHandler,
  appendDenied: (context: DeniedAuditContext) => Promise<void>,
): Router {
  const router = Router();
  const guard = (action: string, roles: readonly StaffRole[]) => createAuditedRoleGuard({
    allowedRoles: roles, action, resourceId, appendDenied,
  });
  const operator = ["administrator", "agentic_operator"] as const;
  const taskReader = ["administrator", "agentic_operator", "agentic_approver", "agentic_governance_admin"] as const;
  const approvalReader = ["administrator", "agentic_operator", "agentic_approver", "agentic_governance_admin"] as const;
  const approver = ["administrator", "agentic_approver"] as const;
  const governance = ["administrator", "agentic_governance_admin"] as const;
  const workforceReader = ["administrator", "agentic_operator", "agentic_approver", "agentic_governance_admin", "agentic_auditor"] as const;
  const auditReader = ["administrator", "agentic_governance_admin", "agentic_auditor"] as const;

  router.post("/tasks", authenticate, guard("agentic.task.create.denied", operator), controller.createTask);
  router.get("/tasks", authenticate, guard("agentic.task.list.denied", taskReader), controller.listTasks);
  router.post("/tasks/:taskId/ready", authenticate, guard("agentic.task.ready.denied", operator), controller.readyTask);
  router.post("/tasks/:taskId/cancel", authenticate, guard("agentic.task.cancel.denied", operator), controller.cancelTask);
  router.get("/tasks/:taskId", authenticate, guard("agentic.task.read.denied", taskReader), controller.getTask);
  router.patch("/tasks/:taskId", authenticate, guard("agentic.task.update.denied", operator), controller.updateTask);

  router.get("/approvals", authenticate, guard("agentic.approval.list.denied", approvalReader), controller.listApprovals);
  router.post("/approvals/:approvalId/decision", authenticate, guard("agentic.approval.decide.denied", approver), controller.decideApproval);
  router.get("/approvals/:approvalId", authenticate, guard("agentic.approval.read.denied", approvalReader), controller.getApproval);

  router.get("/employees", authenticate, guard("agentic.employee.list.denied", workforceReader), controller.listEmployees);
  router.get("/employees/:agentKind", authenticate, guard("agentic.employee.read.denied", workforceReader), controller.getEmployee);

  router.post("/configuration-revisions", authenticate, guard("agentic.configuration.create.denied", governance), controller.createRevision);
  router.post("/configuration-revisions/:revisionId/submit", authenticate, guard("agentic.configuration.submit.denied", governance), controller.submitRevision);
  router.get("/configuration-revisions/:revisionId/diff", authenticate, guard("agentic.configuration.diff.denied", governance), controller.getRevisionDiff);
  router.post("/configuration-revisions/:revisionId/decision", authenticate, guard("agentic.configuration.decide.denied", governance), controller.decideRevision);
  router.patch("/configuration-revisions/:revisionId", authenticate, guard("agentic.configuration.update.denied", governance), controller.updateRevision);

  router.post("/revocations", authenticate, guard("agentic.revocation.create.denied", governance), controller.createRevocation);
  router.get("/audit", authenticate, guard("agentic.audit.read.denied", auditReader), controller.listAudit);
  return router;
}

function resourceId(request: Request): string {
  for (const key of ["taskId", "approvalId", "agentKind", "revisionId"] as const) {
    const value = request.params[key];
    if (typeof value === "string") return value;
  }
  return request.path.split("/").filter(Boolean)[0] ?? "agentic";
}
