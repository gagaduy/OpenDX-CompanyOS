// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Router } from "express";
import type { Pool } from "pg";
import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { PostgresqlMarketingRepository } from "./infrastructure/repositories/implementations/postgresql-marketing.repository";
import { MarketingCampaignService } from "./application/services/implementations/marketing-campaign.service";
import { MarketingController } from "./presentation/controllers/marketing.controller";
import { createMarketingAdminRouter } from "./presentation/routes/marketing.routes";
import type { MarketingRepository } from "./application/repositories/interfaces/marketing.repository";
import type { IMarketingCampaignService } from "./application/services/interfaces/marketing-campaign.service";

export interface MarketingModuleOptions {
  readonly database: Pool;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId?: () => string;
  readonly now?: () => string;
}

export interface MarketingModule {
  readonly adminRouter: Router;
  readonly campaignService: IMarketingCampaignService;
  readonly repository: MarketingRepository;
}

export function createMarketingModule(options: MarketingModuleOptions): MarketingModule {
  const repository = new PostgresqlMarketingRepository(options.database);
  const campaignService = new MarketingCampaignService({
    repository,
    generateId: options.generateId,
    now: options.now,
  });
  const controller = new MarketingController(campaignService);
  const adminRouter = createMarketingAdminRouter({
    controller,
    staffTokenVerifier: options.staffTokenVerifier,
  });

  return {
    adminRouter,
    campaignService,
    repository,
  };
}
