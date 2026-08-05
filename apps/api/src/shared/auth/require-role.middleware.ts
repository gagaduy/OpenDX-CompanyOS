// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import { ApplicationError } from "../http/application-error";
import type { StaffPrincipal, StaffRole } from "./staff-principal";

export function requireStaffRole(...allowedRoles: readonly StaffRole[]): RequestHandler {
  return (_request, response, next) => {
    const principal = response.locals.staffPrincipal as StaffPrincipal | undefined;
    if (principal === undefined) {
      next(new ApplicationError(401, "UNAUTHORIZED", "Authentication required"));
      return;
    }
    if (!principal.roles.some((role) => allowedRoles.includes(role))) {
      next(new ApplicationError(403, "FORBIDDEN", "Insufficient permissions"));
      return;
    }
    next();
  };
}
