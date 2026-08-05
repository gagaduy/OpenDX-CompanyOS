// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import { DatabaseUnavailableError } from "../database/database-unavailable.error";
import { ApplicationError } from "./application-error";

export function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    const supplied = request.header("x-correlation-id")?.trim();
    const correlationId =
      (response.locals.correlationId as string | undefined) ??
      (supplied === undefined || supplied.length === 0 ? randomUUID() : supplied);
    response.setHeader("x-correlation-id", correlationId);

    if (error instanceof ApplicationError) {
      response.status(error.statusCode).json({
        success: false,
        message: error.message,
        errorCode: error.errorCode,
        errors: error.errors,
      });
      return;
    }

    if (error instanceof DatabaseUnavailableError) {
      response.status(503).json({
        success: false,
        message: "A required dependency is unavailable",
        errorCode: "DEPENDENCY_UNAVAILABLE",
        errors: [],
      });
      return;
    }

    response.status(500).json({
      success: false,
      message: "An unexpected error occurred",
      errorCode: "INTERNAL_ERROR",
      errors: [],
    });
  };
}
