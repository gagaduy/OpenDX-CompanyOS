// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import { SERVICE_NAMES } from "@opendx/domain";
import { createCompanyOperatingCoreModule } from "./modules/company-operating-core";

export function createApiApp() {
  const app = express();

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: SERVICE_NAMES.api,
    });
  });

  app.use("/v1", createCompanyOperatingCoreModule());

  return app;
}
