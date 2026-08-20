// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import { AgenticDomainError } from "../../domain/exceptions/agentic-domain.error";

export const agenticErrorMiddleware: ErrorRequestHandler = (error, _request, _response, next) => {
  if (error instanceof AgenticApplicationError || error instanceof AgenticDomainError) {
    const status = error.code.endsWith("_NOT_FOUND") ? 404
      : forbiddenCodes.has(error.code) ? 403
        : conflictCodes.has(error.code) || error.code.includes("STATE") || error.code.includes("ALREADY") ? 409
          : unprocessableCodes.has(error.code) ? 422
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

const forbiddenCodes = new Set([
  "FORBIDDEN",
  "SELF_APPROVAL_FORBIDDEN",
  "POLICY_DENIED",
  "WORKFLOW_POLICY_DENIED",
  "TOOL_SCOPE_DENIED",
  "MODEL_POLICY_DENIED",
  "MODEL_EXECUTION_REVOKED",
  "AGENT_NOT_ACTIVE",
]);

const conflictCodes = new Set([
  "STALE_VERSION",
  "WORKFLOW_SIGNAL_CONFLICT",
  "WORKFLOW_PROJECTION_CONFLICT",
  "WORKFLOW_PROJECTION_STALE",
  "WORKFLOW_TERMINAL_IMMUTABLE",
  "APPROVAL_DECISION_CONFLICT",
  "ACTIVITY_INVOCATION_CONFLICT",
  "MODEL_RUN_CONFLICT",
]);

const unprocessableCodes = new Set([
  "APPROVAL_BINDING_INVALID",
  "INVALID_FROZEN_PLAN",
  "ACTIVITY_INPUT_INVALID",
  "ACTIVITY_OUTCOME_INVALID",
  "WORKFLOW_VERSION_UNSUPPORTED",
]);
