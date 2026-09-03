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
import { createMetricsRouter } from "./shared/http/metrics.routes";
import { requestLogging } from "./shared/http/request-logging.middleware";
import { securityHeaders } from "./shared/http/security-headers.middleware";
import type { Logger } from "./shared/observability/logger";
import type { MetricsRegistry } from "./shared/observability/metrics";

export interface CreateApiAppOptions {
  readonly consoleOrigin?: string;
  readonly storefrontOrigin?: string;
  readonly readiness?: ReadinessProbe;
  readonly readinessTimeoutMs?: number;
  readonly jsonBodyLimit?: string;
  readonly logger?: Logger;
  readonly metrics?: MetricsRegistry;
  readonly metricsPath?: string;
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
  readonly agenticAdminRouter?: Router;
  readonly agenticInternalRouter?: Router;
  readonly agenticToolRouter?: Router;
  readonly marketingAdminRouter?: Router;
  readonly marketingPublicRouter?: Router;
  readonly supportInboundEmailRouter?: Router;
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
  app.use(securityHeaders());
  if (options.logger !== undefined) {
    app.use(requestLogging(options.logger, options.metrics));
  }
  if (options.sepayWebhookRouter !== undefined) {
    app.use("/v1/webhooks/sepay", options.sepayWebhookRouter);
  }
  if (options.agenticToolRouter !== undefined) {
    app.use(
      "/v1/internal/agentic/tools",
      express.json({ limit: "16kb" }),
      options.agenticToolRouter,
    );
  }
  if (options.marketingPublicRouter !== undefined) {
    app.use("/v1/public/marketing/media", options.marketingPublicRouter);
  }
  app.use(express.json({ limit: options.jsonBodyLimit ?? "1mb" }));
  if (options.supportInboundEmailRouter !== undefined) {
    app.use("/v1/public", options.supportInboundEmailRouter);
  }
  app.use(
    createHealthRouter(options.readiness, {
      timeoutMs: options.readinessTimeoutMs ?? 2_000,
    }),
  );
  if (options.metrics !== undefined) {
    app.use(options.metricsPath ?? "/metrics", createMetricsRouter(options.metrics));
  }
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
  if (options.agenticAdminRouter !== undefined) {
    app.use("/v1/admin/agentic", consoleCors, options.agenticAdminRouter);
  }
  if (options.agenticInternalRouter !== undefined) {
    app.use("/v1/internal/agentic", options.agenticInternalRouter);
  }
  if (options.marketingAdminRouter !== undefined) {
    app.use("/v1/admin/marketing", consoleCors, options.marketingAdminRouter);
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
