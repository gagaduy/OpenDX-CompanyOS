// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import cors from "cors";
import { createCompanyOperatingCoreModule } from "./modules/company-operating-core";
import { ApplicationError } from "./shared/http/application-error";
import { correlationIdMiddleware } from "./shared/http/correlation-id.middleware";
import { createErrorHandler } from "./shared/http/error-handler.middleware";
import {
  createHealthRouter,
  type ReadinessProbe,
} from "./shared/http/health.routes";

export interface CreateApiAppOptions {
  readonly consoleOrigin?: string;
  readonly readiness?: ReadinessProbe;
}

export function createApiApp(options: CreateApiAppOptions = {}) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(cors({ origin: options.consoleOrigin ?? "http://localhost:3000" }));
  app.use(correlationIdMiddleware);
  app.use(createHealthRouter(options.readiness));
  app.use("/v1", createCompanyOperatingCoreModule());
  app.use((_request, _response, next) => {
    next(new ApplicationError(404, "NOT_FOUND", "Resource not found"));
  });
  app.use(createErrorHandler());

  return app;
}
