// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Router } from "express";
import { CompanyOperatingCoreMapper } from "./application/mappers/company-operating-core.mapper";
import { CompanyOperatingCoreService } from "./application/services/implementations/company-operating-core.service";
import { InMemoryCompanyOperatingCoreRepository } from "./infrastructure/repositories/implementations/in-memory-company-operating-core.repository";
import { CompanyOperatingCoreController } from "./presentation/controllers/company-operating-core.controller";
import { createCompanyOperatingCoreRouter } from "./presentation/routes/company-operating-core.routes";
import { createNovaCommerceSnapshot } from "./tests/fixtures/nova-commerce.fixture";

export function createCompanyOperatingCoreModule(): Router {
  const repository = new InMemoryCompanyOperatingCoreRepository(
    createNovaCommerceSnapshot(),
  );
  const mapper = new CompanyOperatingCoreMapper();
  const service = new CompanyOperatingCoreService(repository, mapper);
  const controller = new CompanyOperatingCoreController(service);

  return createCompanyOperatingCoreRouter(controller);
}
