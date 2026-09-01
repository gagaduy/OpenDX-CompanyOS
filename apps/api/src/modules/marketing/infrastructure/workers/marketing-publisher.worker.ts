// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { MarketingPublisherService } from "../../application/services/interfaces/marketing-publisher.service";
import type { MarketingRepository } from "../../application/repositories/interfaces/marketing.repository";

export interface MarketingPublisherWorkerOptions {
  readonly publisherService: MarketingPublisherService;
  readonly marketingRepository?: MarketingRepository;
  readonly workerId?: string;
  readonly batchSize?: number;
  readonly pollIntervalMs?: number;
  readonly onError?: (error: unknown) => void;
  readonly getPageAccessToken?: (pageId: string) => Promise<string | null>;
}

export class MarketingPublisherWorker {
  private readonly publisherService: MarketingPublisherService;
  private readonly marketingRepository?: MarketingRepository;
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly onError: (error: unknown) => void;
  private readonly getPageAccessToken?: (pageId: string) => Promise<string | null>;

  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: MarketingPublisherWorkerOptions) {
    this.publisherService = options.publisherService;
    this.marketingRepository = options.marketingRepository;
    this.workerId = options.workerId ?? `publisher-worker-${randomUUID().slice(0, 8)}`;
    this.batchSize = options.batchSize ?? 10;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.onError = options.onError ?? ((err) => console.error("MarketingPublisherWorker error:", err));
    this.getPageAccessToken = options.getPageAccessToken;
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
    try {
      if (typeof this.publisherService.publishDueTargets === "function") {
        const records = await this.publisherService.publishDueTargets({
          workerId: this.workerId,
          limit: this.batchSize,
        });
        return records.length;
      }

      if (this.marketingRepository) {
        let processed = 0;
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
        return processed;
      }
      return 0;
    } catch (error) {
      this.onError(error);
      return 0;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNext(this.pollIntervalMs);
    }, delayMs);
  }
}
