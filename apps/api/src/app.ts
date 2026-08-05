// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import cors from "cors";
import { createCompanyOperatingCoreModule } from "./modules/company-operating-core";
import type { ICompanyOperatingCoreRepository } from "./modules/company-operating-core/application/repositories/interfaces/company-operating-core.repository";
import type { Router } from "express";
import { ApplicationError } from "./shared/http/application-error";
import { correlationIdMiddleware } from "./shared/http/correlation-id.middleware";
import { createErrorHandler } from "./shared/http/error-handler.middleware";
import {
  createHealthRouter,
  type ReadinessProbe,
} from "./shared/http/health.routes";

export interface CreateApiAppOptions {
  readonly consoleOrigin?: string;
  readonly storefrontOrigin?: string;
  readonly readiness?: ReadinessProbe;
  readonly companyOperatingCoreRepository?: ICompanyOperatingCoreRepository;
  readonly catalogAdminRouter?: Router;
  readonly storefrontRouter?: Router;
  readonly inventoryRouter?: Router;
}

export function createApiApp(options: CreateApiAppOptions = {}) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(cors({ origin: [options.consoleOrigin ?? "http://localhost:3000", options.storefrontOrigin ?? "http://localhost:3100"], credentials: true }));
  app.use(correlationIdMiddleware);
  app.use(createHealthRouter(options.readiness));
  if (options.companyOperatingCoreRepository !== undefined) {
    app.use(
      "/v1",
      createCompanyOperatingCoreModule(options.companyOperatingCoreRepository),
    );
  }
  if (options.catalogAdminRouter !== undefined) {
    app.use("/v1/admin/catalog", options.catalogAdminRouter);
  }
  if (options.inventoryRouter !== undefined) {
    app.use("/v1/admin/inventory", options.inventoryRouter);
  }
  if (options.storefrontRouter !== undefined) {
    app.use("/v1/storefront", options.storefrontRouter);
  }
  app.use((_request, _response, next) => {
    next(new ApplicationError(404, "NOT_FOUND", "Resource not found"));
  });
  app.use(createErrorHandler());

  return app;
}
