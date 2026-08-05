// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../http/application-error";
import type { StaffPrincipal, StaffRole } from "./staff-principal";

export interface DeniedAuditContext {
  readonly actorId: string;
  readonly action: string;
  readonly resourceId: string;
  readonly correlationId: string;
}

export interface AuditedRoleGuardOptions {
  readonly allowedRoles: readonly StaffRole[];
  readonly action: string;
  readonly resourceId: (request: Request) => string;
  readonly appendDenied: (context: DeniedAuditContext) => Promise<void>;
}

export function createAuditedRoleGuard(
  options: AuditedRoleGuardOptions,
): RequestHandler {
  return async (request, response, next) => {
    const principal = response.locals.staffPrincipal as StaffPrincipal | undefined;
    if (principal === undefined) {
      next(new ApplicationError(401, "UNAUTHORIZED", "Authentication required"));
      return;
    }
    if (principal.roles.some((role) => options.allowedRoles.includes(role))) {
      next();
      return;
    }
    try {
      await options.appendDenied({
        actorId: principal.subject,
        action: options.action,
        resourceId: options.resourceId(request),
        correlationId: response.locals.correlationId as string,
      });
      next(new ApplicationError(403, "FORBIDDEN", "Insufficient permissions"));
    } catch (error) {
      next(error);
    }
  };
}
