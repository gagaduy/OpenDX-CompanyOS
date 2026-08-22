// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CrmApplicationError } from "../../application/services/crm-application.error";
import { CrmDomainError } from "../../domain/exceptions/crm-domain.error";

export const crmErrorMiddleware: ErrorRequestHandler = (error, _request, _response, next) => {
  if (error instanceof CrmApplicationError) {
    const status = error.code === "CUSTOMER_NOT_FOUND"
      || error.code === "NOTE_NOT_FOUND"
      || error.code === "FOLLOWUP_NOT_FOUND"
      ? 404
      : error.code === "STALE_VERSION"
        ? 409
        : error.code === "FORBIDDEN"
          ? 403
          : 400;
    next(new ApplicationError(status, error.code, error.message));
    return;
  }
  if (error instanceof CrmDomainError) {
    const status = error.code === "INVALID_CRM_NOTE" || error.code === "INVALID_FOLLOWUP" ? 400 : 409;
    next(new ApplicationError(status, error.code, error.message));
    return;
  }
  if (error instanceof RangeError) {
    next(new ApplicationError(400, "VALIDATION_ERROR", "Validation failed"));
    return;
  }
  next(error);
};
