// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { Logger } from "../observability/logger";
import type { MetricsRegistry } from "../observability/metrics";

export function requestLogging(
  logger: Logger,
  metrics?: MetricsRegistry,
): RequestHandler {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();

    response.on("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = stableRoute(request);
      metrics?.recordHttpRequest({
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs,
      });
      logger.info("http_request", {
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs),
        correlationId: response.locals.correlationId,
      });
    });

    next();
  };
}

function stableRoute(request: Parameters<RequestHandler>[0]): string {
  const routePath = request.route?.path;
  if (typeof routePath === "string" && routePath.length > 0) {
    if (routePath.includes("@")) return "unmatched";
    return routePath;
  }
  return "unmatched";
}
