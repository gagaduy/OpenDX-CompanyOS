// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import { SERVICE_NAMES } from "@opendx/domain";
import { InMemoryCompanyOperatingCoreRepository } from "./company-core/repository";
import { createCompanyOperatingCoreRouter } from "./company-core/routes";
import { createCompanyCoreSeed } from "./company-core/seed";

export function createApiApp() {
  const app = express();

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: SERVICE_NAMES.api,
    });
  });

  const companyCoreRepository = new InMemoryCompanyOperatingCoreRepository(
    createCompanyCoreSeed(),
  );
  app.use("/v1", createCompanyOperatingCoreRouter(companyCoreRepository));

  return app;
}
