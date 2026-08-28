// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MarketingPublisherService } from "../../application/services/interfaces/marketing-publisher.service";
import type { MarketingRepository } from "../../application/repositories/interfaces/marketing.repository";

export interface MarketingPublisherWorkerOptions {
  readonly publisherService: MarketingPublisherService;
  readonly marketingRepository: MarketingRepository;
  readonly getPageAccessToken?: (pageId: string) => Promise<string | null>;
  readonly pollIntervalMs?: number;
  readonly onError?: (error: unknown) => void;
}

export class MarketingPublisherWorker {
  private readonly publisherService: MarketingPublisherService;
  private readonly marketingRepository: MarketingRepository;
  private readonly getPageAccessToken?: (pageId: string) => Promise<string | null>;
  private readonly pollIntervalMs: number;
  private readonly onError: (error: unknown) => void;

  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: MarketingPublisherWorkerOptions) {
    this.publisherService = options.publisherService;
    this.marketingRepository = options.marketingRepository;
    this.getPageAccessToken = options.getPageAccessToken;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.onError = options.onError ?? ((err) => console.error("MarketingPublisherWorker error:", err));
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNext(0);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<number> {
    let processed = 0;
    try {
      const campaigns = await this.marketingRepository.listCampaigns({ limit: 50 });
      for (const campaign of campaigns) {
        if (campaign.state !== "awaiting_human_approval" && campaign.state !== "publishing") {
          continue;
        }
        const pkg = await this.marketingRepository.findCurrentPackageByCampaignId(campaign.id);
        if (!pkg || pkg.status !== "approved") {
          continue;
        }

        const brief = await this.marketingRepository.findBriefByCampaignId(campaign.id);
        if (!brief) continue;

        const pageId = brief.facebookPageConfigurationId || "100200300400500";
        const pageAccessToken = this.getPageAccessToken
          ? await this.getPageAccessToken(pageId)
          : process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "default-token";

        if (!pageAccessToken) continue;

        await this.publisherService.publishApprovedPackage({
          campaignId: campaign.id,
          packageId: pkg.id,
          pageId,
          pageAccessToken,
        });

        processed++;
      }
    } catch (error) {
      this.onError(error);
    }
    return processed;
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNext(this.pollIntervalMs);
    }, delayMs);
  }
}
