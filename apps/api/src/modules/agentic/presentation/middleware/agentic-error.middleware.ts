// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import { AgenticDomainError } from "../../domain/exceptions/agentic-domain.error";

export const agenticErrorMiddleware: ErrorRequestHandler = (error, _request, _response, next) => {
  if (error instanceof AgenticApplicationError || error instanceof AgenticDomainError) {
    const status = error.code.endsWith("_NOT_FOUND") ? 404
      : error.code === "FORBIDDEN" || error.code === "SELF_APPROVAL_FORBIDDEN" || error.code === "POLICY_DENIED" ? 403
        : error.code === "STALE_VERSION" || error.code.includes("STATE") || error.code.includes("ALREADY") ? 409
          : error.code === "TOOL_UNAVAILABLE" ? 503 : 400;
    next(new ApplicationError(status, error.code, error.message));
    return;
  }
  if (error instanceof RangeError) {
    next(new ApplicationError(400, "VALIDATION_ERROR", "Validation failed"));
    return;
  }
  next(error);
};
