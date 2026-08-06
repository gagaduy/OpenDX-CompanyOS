// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { authenticateStaff } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { PromotionService } from "./application/services/implementations/promotion.service";
import { PostgresqlPromotionRepository } from "./infrastructure/repositories/implementations/postgresql-promotion.repository";
import { PromotionController } from "./presentation/controllers/promotion.controller";
import { createPromotionRouter } from "./presentation/routes/promotion.routes";

export interface PromotionModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId: () => string;
  readonly now: () => string;
}

export function createPromotionModule(dependencies: PromotionModuleDependencies) {
  const service = new PromotionService(new PostgresqlPromotionRepository(), dependencies.transactions, dependencies.generateId, dependencies.now);
  return {
    adminRouter: createPromotionRouter(new PromotionController(service), authenticateStaff(dependencies.staffTokenVerifier)),
    checkout: service,
  };
}
