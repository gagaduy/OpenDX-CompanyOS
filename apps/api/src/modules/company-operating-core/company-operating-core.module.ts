// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Router } from "express";
import type { ICompanyOperatingCoreRepository } from "./application/repositories/interfaces/company-operating-core.repository";
import { CompanyOperatingCoreMapper } from "./application/mappers/company-operating-core.mapper";
import { CompanyOperatingCoreService } from "./application/services/implementations/company-operating-core.service";
import { CompanyOperatingCoreController } from "./presentation/controllers/company-operating-core.controller";
import { createCompanyOperatingCoreRouter } from "./presentation/routes/company-operating-core.routes";

export function createCompanyOperatingCoreModule(
  repository: ICompanyOperatingCoreRepository,
): Router {
  const mapper = new CompanyOperatingCoreMapper();
  const service = new CompanyOperatingCoreService(repository, mapper);
  const controller = new CompanyOperatingCoreController(service);

  return createCompanyOperatingCoreRouter(controller);
}
