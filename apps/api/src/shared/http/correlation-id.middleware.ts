// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const correlationIdMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const supplied = request.header("x-correlation-id")?.trim();
  const correlationId = supplied === undefined || supplied.length === 0
    ? randomUUID()
    : supplied;
  response.locals.correlationId = correlationId;
  response.setHeader("x-correlation-id", correlationId);
  next();
};
