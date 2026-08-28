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
import type { MarketingPublisherService } from "./application/services/interfaces/marketing-publisher.service";
import { MarketingPublisherServiceImpl } from "./application/services/implementations/marketing-publisher.service";
import type { MarketingArtifactService } from "./application/services/interfaces/marketing-artifact-generator.service";
import { MarketingArtifactServiceImpl } from "./application/services/implementations/marketing-artifact.service";
import type { FacebookPublisherPort } from "./application/ports/facebook-publisher.port";
import { MetaGraphFacebookPublisherAdapter } from "./infrastructure/adapters/meta-graph-facebook-publisher.adapter";
import { MarketingPublisherWorker } from "./infrastructure/workers/marketing-publisher.worker";

export interface MarketingModuleOptions {
  readonly database: Pool;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly facebookPublisher?: FacebookPublisherPort;
  readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  readonly storageWriter?: (key: string, buffer: Buffer, mediaType: string) => Promise<void>;
  readonly storageReader?: (key: string) => Promise<Buffer>;
  readonly generateId?: () => string;
  readonly now?: () => string;
}

export interface MarketingModule {
  readonly adminRouter: Router;
  readonly campaignService: IMarketingCampaignService;
  readonly publisherService: MarketingPublisherService;
  readonly publisherWorker: MarketingPublisherWorker;
  readonly artifactService: MarketingArtifactService;
  readonly repository: MarketingRepository;
}

export function createMarketingModule(options: MarketingModuleOptions): MarketingModule {
  const repository = new PostgresqlMarketingRepository(options.database);
  const campaignService = new MarketingCampaignService({
    repository,
    generateId: options.generateId,
    now: options.now,
  });
  const facebookPublisher = options.facebookPublisher ?? new MetaGraphFacebookPublisherAdapter({ now: options.now });
  const publisherService = new MarketingPublisherServiceImpl({
    marketingRepository: repository,
    facebookPublisher,
    assetStorageReader: options.assetStorageReader,
    now: options.now,
    generateId: options.generateId,
  });
  const publisherWorker = new MarketingPublisherWorker({
    publisherService,
    marketingRepository: repository,
  });
  const artifactService = new MarketingArtifactServiceImpl({
    marketingRepository: repository,
    storageWriter: options.storageWriter,
    storageReader: options.storageReader,
    now: options.now,
    generateId: options.generateId,
  });
  const controller = new MarketingController(campaignService, artifactService, publisherService);
  const adminRouter = createMarketingAdminRouter({
    controller,
    staffTokenVerifier: options.staffTokenVerifier,
  });

  return {
    adminRouter,
    campaignService,
    publisherService,
    publisherWorker,
    artifactService,
    repository,
  };
}
