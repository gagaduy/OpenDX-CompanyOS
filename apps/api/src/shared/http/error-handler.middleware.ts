// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
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

    if (error instanceof ZodError) {
      response.status(400).json({
        success: false,
        message: "Invalid request payload",
        errorCode: "VALIDATION_FAILED",
        errors: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
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

    if (isPayloadTooLargeError(error)) {
      response.status(413).json({
        success: false,
        message: "Request body is too large",
        errorCode: "PAYLOAD_TOO_LARGE",
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

function isPayloadTooLargeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { readonly type?: unknown }).type === "entity.too.large"
  );
}
