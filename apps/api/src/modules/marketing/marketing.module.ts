// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
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
import type { SocialPublisherPort } from "./application/ports/social-publisher.port";
import { SocialPublisherRegistry } from "./application/services/implementations/social-publisher-registry";
import { MetaGraphFacebookPublisherAdapter } from "./infrastructure/adapters/meta-graph-facebook-publisher.adapter";
import { MetaGraphInstagramPublisherAdapter } from "./infrastructure/adapters/meta-graph-instagram-publisher.adapter";
import { FakeInstagramPublisherAdapter } from "./infrastructure/adapters/fake-instagram-publisher.adapter";
import { MarketingPublisherWorker } from "./infrastructure/workers/marketing-publisher.worker";
import { create1x1SquarePngBuffer } from "./infrastructure/generators/facebook-visual-png.generator";

export interface MarketingModuleOptions {
  readonly database: Pool;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly publicationConfig?: MarketingPublicationConfiguration;
  readonly publisherRegistry?: SocialPublisherRegistry;
  readonly facebookPublisher?: FacebookPublisherPort;
  readonly assetStorageReader?: (storageKey: string) => Promise<Buffer>;
  readonly storageWriter?: (key: string, buffer: Buffer, mediaType: string) => Promise<void>;
  readonly storageReader?: (key: string) => Promise<Buffer>;
  readonly generateId?: () => string;
  readonly now?: () => string;
  readonly workerId?: string;
  readonly pollIntervalMs?: number;
  readonly targetLeaseSeconds?: number;
}

export interface MarketingModule {
  readonly adminRouter: Router;
  readonly campaignService: IMarketingCampaignService;
  readonly publisherService: MarketingPublisherService;
  readonly publisherWorker: MarketingPublisherWorker;
  readonly artifactService: MarketingArtifactService;
  readonly repository: MarketingRepository;
  readonly publisherRegistry: SocialPublisherRegistry;
}

export function createMarketingModule(options: MarketingModuleOptions): MarketingModule {
  const repository = new PostgresqlMarketingRepository(options.database);
  const materializeVisualAsset = options.storageWriter === undefined
    ? undefined
    : async (input: {
        readonly campaignId?: string;
        readonly versionNumber?: number;
        readonly storageKey: string;
        readonly mediaType: "image/png";
        readonly width: number;
        readonly height: number;
        readonly altText?: string;
      }) => {
        let buffer: Buffer = create1x1SquarePngBuffer(input.width, input.height);

        const apiKey = process.env.OPENROUTER_API_KEY?.trim();
        if (apiKey && process.env.OPENROUTER_EXECUTION_ENABLED === "true") {
          try {
            const rawTopic = (input.altText ?? "")
              .replace(/^Hình ảnh chiến dịch v\d+\s*-\s*/i, "")
              .replace(/^Chiến dịch:\s*/i, "")
              .replace(/^\[.*?\]\s*/i, "")
              .replace(/^(triển khai|viết bài|thiết kế|lên bài|tạo|quảng bá|chạy)\s*(chiến dịch)?\s*(tiếp thị|quảng cáo)?\s*(cho)?\s*/i, "")
              .trim();

            const lower = rawTopic.toLowerCase();
            let productDescription: string;
            if (lower.includes("bàn phím cơ") || lower.includes("keyboard") || lower.includes("nova mechanical")) {
              productDescription = "a premium Nova Mechanical Gaming Keyboard with custom illuminated RGB switches, aluminum chassis, minimalist dark studio tech desk";
            } else if (lower.includes("tai nghe") || lower.includes("headset") || lower.includes("headphone")) {
              productDescription = "a sleek premium wireless gaming headset with soft breathable memory foam cushions, subtle RGB illumination accent, dark studio background";
            } else if (lower.includes("laptop") || lower.includes("máy tính xách tay")) {
              productDescription = "a modern ultra-thin flagship laptop with aluminum chassis, stunning vibrant edge-to-edge display, illuminated keyboard, sleek tech desk";
            } else if (lower.includes("chuột") || lower.includes("mouse")) {
              productDescription = "an ergonomic wireless gaming mouse with precision optical sensor, matte texture, subtle RGB glow";
            } else if (lower.includes("đồng hồ") || lower.includes("smartwatch") || lower.includes("watch")) {
              productDescription = "a luxury modern smartwatch with AMOLED touchscreen display, titanium case, premium fluoroelastomer strap";
            } else if (lower.includes("điện thoại") || lower.includes("smartphone") || lower.includes("phone")) {
              productDescription = "a flagship smartphone with curved AMOLED screen, glossy ceramic back, multi-camera lens array, studio lighting";
            } else {
              const cleaned = rawTopic
                .replace(/trên fanpage/gi, "")
                .replace(/trên facebook/gi, "")
                .replace(/mạng xã hội/gi, "")
                .replace(/hôm nay/gi, "")
                .replace(/giảm giá\s*\d+%/gi, "")
                .trim();
              productDescription = cleaned ? `a commercial hero showcase of ${cleaned}` : "a sleek high-tech consumer electronics product in modern studio setting";
            }

            const prompt = `Professional commercial studio product photography of ${productDescription}.
Style & Composition:
- Centered hero product shot, luxury commercial advertisement aesthetics, 1:1 square aspect ratio.
- Photorealistic studio lighting, soft shadows, sharp focus, volumetric rim lighting, crisp 8k details, premium finish and textures.
- Sleek modern atmospheric dark studio background with subtle ambient color gradient complementing the product.
- CLEAN VISUAL RULES:
  * DO NOT include any text, letters, words, typos, phrases, slogans, or sentences.
  * DO NOT include floating labels, badges, user interface elements, or promotional banners.
  * NO watermarks, NO brand logos or graphic overlays.
  * PURE photorealistic product photograph only.`;

            const model = process.env.MARKETING_VISUAL_MODELS || "google/gemini-2.5-flash-image";

            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
              }),
              signal: AbortSignal.timeout(15000),
            });

            if (res.ok) {
              const data = (await res.json()) as any;
              const msg = data.choices?.[0]?.message;
              let base64Data: string | undefined;

              if (Array.isArray(msg?.images) && msg.images.length > 0) {
                const firstImg = msg.images[0];
                const url = typeof firstImg === "string" ? firstImg : firstImg?.image_url?.url || firstImg?.url;
                if (url) {
                  const match = url.match(/data:image\/[a-zA-Z0-9.+_-]+;base64,([\s\S]+)/);
                  base64Data = match ? match[1] : url;
                }
              }

              if (!base64Data && typeof msg?.content === "string") {
                const match = msg.content.match(/data:image\/[a-zA-Z0-9.+_-]+;base64,([\s\S]+)/);
                if (match) {
                  base64Data = match[1];
                }
              }

              if (base64Data) {
                const cleaned = base64Data.replace(/\s+/g, "");
                const decoded = Buffer.from(cleaned, "base64");
                if (decoded.length > 500) {
                  buffer = decoded;
                }
              }
            }
          } catch (err) {
            console.error("OpenRouter image generation failed, fallback to solid buffer:", err);
          }
        }

        await options.storageWriter!(input.storageKey, buffer, input.mediaType);
        return {
          byteSize: buffer.byteLength,
          imageDigest: createHash("sha256").update(buffer).digest("hex"),
        };
      };

  const campaignService = new MarketingCampaignService({
    repository,
    ...(materializeVisualAsset === undefined ? {} : { materializeVisualAsset }),
    generateId: options.generateId,
    now: options.now,
  });

  const publisherRegistry = options.publisherRegistry ?? new SocialPublisherRegistry();
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
      publisherRegistry.register(new MetaGraphInstagramPublisherAdapter({
        businessAccountId: options.publicationConfig.instagram.businessAccountId,
        accessToken: options.publicationConfig.instagram.accessToken,
        publicMediaBaseUrl: options.publicationConfig.instagram.publicMediaBaseUrl,
        graphApiBaseUrl: options.publicationConfig.meta.graphBaseUrl,
        requestTimeoutMs: options.publicationConfig.meta.requestTimeoutMs,
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
    campaignService,
    publisherService,
    publisherWorker,
    artifactService,
    repository,
    publisherRegistry,
  };
}
