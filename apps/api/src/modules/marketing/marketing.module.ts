// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Router } from "express";
import type { Pool } from "pg";
import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import type { MarketingPublicationConfiguration } from "../../shared/config/environment";
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
import type {
  SocialPublisherPort,
  SocialPublishMediaItem,
} from "./application/ports/social-publisher.port";
import type { MarketingPublicMediaStoragePort } from "./application/ports/marketing-public-media-storage.port";
import { SocialPublisherRegistry } from "./application/services/implementations/social-publisher-registry";
import { MarketingPublicMediaServiceImpl } from "./application/services/implementations/marketing-public-media.service";
import { MetaGraphFacebookPublisherAdapter } from "./infrastructure/adapters/meta-graph-facebook-publisher.adapter";
import { MetaGraphInstagramPublisherAdapter } from "./infrastructure/adapters/meta-graph-instagram-publisher.adapter";
import { FakeInstagramPublisherAdapter } from "./infrastructure/adapters/fake-instagram-publisher.adapter";
import { SharpMarketingImageTransformerAdapter } from "./infrastructure/adapters/sharp-marketing-image-transformer.adapter";
import { MarketingPublisherWorker } from "./infrastructure/workers/marketing-publisher.worker";
import { createMarketingVisualMaterializer } from "./infrastructure/adapters/openrouter-marketing-visual.adapter";
import { createMarketingPublicMediaRouter } from "./presentation/routes/marketing-public-media.routes";

export interface MarketingModuleOptions {
  readonly database: Pool;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly publicationConfig?: MarketingPublicationConfiguration;
  readonly publisherRegistry?: SocialPublisherRegistry;
  readonly facebookPublisher?: FacebookPublisherPort;
  readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  readonly storageWriter?: (key: string, buffer: Buffer, mediaType: string) => Promise<void>;
  readonly storageReader?: (key: string) => Promise<Buffer>;
  readonly publicMediaStorage?: MarketingPublicMediaStoragePort;
  readonly generateId?: () => string;
  readonly now?: () => string;
  readonly workerId?: string;
  readonly pollIntervalMs?: number;
  readonly targetLeaseSeconds?: number;
}

export interface MarketingModule {
  readonly adminRouter: Router;
  readonly publicRouter?: Router;
  readonly campaignService: IMarketingCampaignService;
  readonly publisherService: MarketingPublisherService;
  readonly publisherWorker: MarketingPublisherWorker;
  readonly artifactService: MarketingArtifactService;
  readonly repository: MarketingRepository;
  readonly publisherRegistry: SocialPublisherRegistry;
}

export function createMarketingModule(options: MarketingModuleOptions): MarketingModule {
  const repository = new PostgresqlMarketingRepository(options.database);
  const imageTransformer = new SharpMarketingImageTransformerAdapter();
  const materializeVisualAsset = options.storageWriter === undefined
    ? undefined
    : createMarketingVisualMaterializer({
        enabled: process.env.OPENROUTER_EXECUTION_ENABLED === "true",
        apiKey: process.env.OPENROUTER_API_KEY,
        models: process.env.MARKETING_VISUAL_MODELS || "google/gemini-2.5-flash-image",
        timeoutMs: Number(process.env.MARKETING_VISUAL_TIMEOUT_MS ?? 120000),
        storageWriter: options.storageWriter,
      });

  const instagramConfiguration = options.publicationConfig?.instagram;
  const campaignService = new MarketingCampaignService({
    repository,
    ...(materializeVisualAsset === undefined ? {} : { materializeVisualAsset }),
    generateId: options.generateId,
    now: options.now,
    instagramMode: instagramConfiguration?.mode,
    instagramAccountId:
      instagramConfiguration?.mode === "simulation" || instagramConfiguration?.mode === "live"
        ? instagramConfiguration.accountConfigurationId
        : undefined,
  });

  const publisherRegistry = options.publisherRegistry ?? new SocialPublisherRegistry();
  let publicRouter: Router | undefined;
  let preparePublicMediaUrl: ((media: SocialPublishMediaItem) => Promise<string>) | undefined;
  if (instagramConfiguration?.mode === "live") {
    if (options.publicMediaStorage === undefined) {
      throw new Error("Live Instagram publication requires Marketing public media storage");
    }
    const publicMediaService = new MarketingPublicMediaServiceImpl({
      repository,
      storage: options.publicMediaStorage,
      transformer: imageTransformer,
      publicBaseUrl: instagramConfiguration.publicMediaBaseUrl,
      signingSecret: instagramConfiguration.signingSecret,
      urlTtlSeconds: instagramConfiguration.urlTtlSeconds,
      jpegQuality: instagramConfiguration.jpegQuality,
      now: options.now,
    });
    publicRouter = createMarketingPublicMediaRouter({
      service: publicMediaService,
      rateLimit: instagramConfiguration.rateLimit,
      rateWindowMs: instagramConfiguration.rateWindowMs,
    });
    preparePublicMediaUrl = (media) => publicMediaService.prepareUrl(media);
  }
  if (!options.publisherRegistry) {
    if (options.facebookPublisher) {
      if ("publish" in options.facebookPublisher) {
        publisherRegistry.register(options.facebookPublisher as unknown as SocialPublisherPort);
      } else {
        publisherRegistry.register(new MetaGraphFacebookPublisherAdapter({
          pageId: options.publicationConfig?.facebook?.pageId,
          pageAccessToken: options.publicationConfig?.facebook?.pageAccessToken,
          graphApiBaseUrl: options.publicationConfig?.meta?.graphBaseUrl,
          requestTimeoutMs: options.publicationConfig?.meta?.requestTimeoutMs,
          now: options.now,
        }));
      }
    } else {
      publisherRegistry.register(new MetaGraphFacebookPublisherAdapter({
        pageId: options.publicationConfig?.facebook?.pageId,
        pageAccessToken: options.publicationConfig?.facebook?.pageAccessToken,
        graphApiBaseUrl: options.publicationConfig?.meta?.graphBaseUrl,
        requestTimeoutMs: options.publicationConfig?.meta?.requestTimeoutMs,
        now: options.now,
      }));
    }

    if (options.publicationConfig?.instagram?.mode === "live") {
      if (preparePublicMediaUrl === undefined) {
        throw new Error("Live Instagram publication requires Marketing public media storage");
      }
      publisherRegistry.register(new MetaGraphInstagramPublisherAdapter({
        businessAccountId: options.publicationConfig.instagram.businessAccountId,
        accessToken: options.publicationConfig.instagram.accessToken,
        preparePublicMediaUrl,
        graphApiBaseUrl: options.publicationConfig.meta.graphBaseUrl,
        requestTimeoutMs: options.publicationConfig.meta.requestTimeoutMs,
        pollIntervalMs: options.publicationConfig.instagram.containerPollIntervalMs,
        maxPollAttempts: options.publicationConfig.instagram.containerMaxPollAttempts,
        now: options.now,
      }));
    } else {
      publisherRegistry.register(new FakeInstagramPublisherAdapter(options.now));
    }
  }

  const publisherService = new MarketingPublisherServiceImpl({
    marketingRepository: repository,
    publisherRegistry,
    assetStorageReader: options.assetStorageReader,
    now: options.now,
    generateId: options.generateId,
    defaultWorkerId: options.workerId,
    leaseSeconds: options.targetLeaseSeconds ?? options.publicationConfig?.targetLeaseSeconds,
  });

  const publisherWorker = new MarketingPublisherWorker({
    publisherService,
    marketingRepository: repository,
    workerId: options.workerId,
    pollIntervalMs: options.pollIntervalMs ?? options.publicationConfig?.pollIntervalMs,
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
    ...(publicRouter === undefined ? {} : { publicRouter }),
    campaignService,
    publisherService,
    publisherWorker,
    artifactService,
    repository,
    publisherRegistry,
  };
}
