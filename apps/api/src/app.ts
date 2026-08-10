// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import cors, { type CorsOptions } from "cors";
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
  readonly promotionAdminRouter?: Router;
  readonly orderAdminRouter?: Router;
  readonly paymentAdminRouter?: Router;
  readonly crmAdminRouter?: Router;
  readonly supportAdminRouter?: Router;
  readonly reportingAdminRouter?: Router;
  readonly sepayWebhookRouter?: Router;
}

function createAudienceCors(allowedOrigin: string) {
  const options: CorsOptions = {
    origin(requestOrigin, callback) {
      callback(
        null,
        requestOrigin === undefined || requestOrigin === allowedOrigin,
      );
    },
    credentials: true,
  };

  return cors(options);
}

export function createApiApp(options: CreateApiAppOptions = {}) {
  const app = express();
  const consoleCors = createAudienceCors(
    options.consoleOrigin ?? "http://localhost:3000",
  );
  const storefrontCors = createAudienceCors(
    options.storefrontOrigin ?? "http://localhost:3100",
  );

  app.use(correlationIdMiddleware);
  if (options.sepayWebhookRouter !== undefined) {
    app.use("/v1/webhooks/sepay", options.sepayWebhookRouter);
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(createHealthRouter(options.readiness));
  if (options.companyOperatingCoreRepository !== undefined) {
    app.use(
      "/v1",
      consoleCors,
      createCompanyOperatingCoreModule(options.companyOperatingCoreRepository),
    );
  }
  if (options.catalogAdminRouter !== undefined) {
    app.use("/v1/admin/catalog", consoleCors, options.catalogAdminRouter);
  }
  if (options.inventoryRouter !== undefined) {
    app.use("/v1/admin/inventory", consoleCors, options.inventoryRouter);
  }
  if (options.promotionAdminRouter !== undefined) {
    app.use("/v1/admin/promotions", consoleCors, options.promotionAdminRouter);
  }
  if (options.orderAdminRouter !== undefined) {
    app.use("/v1/admin/orders", consoleCors, options.orderAdminRouter);
  }
  if (options.paymentAdminRouter !== undefined) {
    app.use("/v1/admin/payments", consoleCors, options.paymentAdminRouter);
  }
  if (options.crmAdminRouter !== undefined) {
    app.use("/v1/admin/customers", consoleCors, options.crmAdminRouter);
  }
  if (options.supportAdminRouter !== undefined) app.use("/v1/admin/support/tickets", consoleCors, options.supportAdminRouter);
  if (options.reportingAdminRouter !== undefined) {
    app.use("/v1/admin/reporting", consoleCors, options.reportingAdminRouter);
  }
  if (options.storefrontRouter !== undefined) {
    app.use("/v1/storefront", storefrontCors, options.storefrontRouter);
  }
  app.use((_request, _response, next) => {
    next(new ApplicationError(404, "NOT_FOUND", "Resource not found"));
  });
  app.use(createErrorHandler());

  return app;
}
