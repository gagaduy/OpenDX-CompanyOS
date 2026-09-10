// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SocialTokensSummaryView } from "../../dtos/social-token.dto";
import type { SocialTokenManagerService } from "../interfaces/social-token-manager.service";
import type { AutonomousSocialTokenMonitorService } from "../interfaces/autonomous-social-token-monitor.service";

export interface AutonomousSocialTokenMonitorOptions {
  readonly socialTokenManager: SocialTokenManagerService;
  readonly intervalMs?: number;
  readonly autoRenewDaysThreshold?: number;
  readonly logger?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export class AutonomousSocialTokenMonitorServiceImpl implements AutonomousSocialTokenMonitorService {
  private readonly manager: SocialTokenManagerService;
  private readonly intervalMs: number;
  private readonly autoRenewDaysThreshold: number;
  private readonly logger: NonNullable<AutonomousSocialTokenMonitorOptions["logger"]>;
  private timer: NodeJS.Timeout | null = null;
  private isExecuting = false;

  constructor(options: AutonomousSocialTokenMonitorOptions) {
    this.manager = options.socialTokenManager;
    this.intervalMs = options.intervalMs ?? 6 * 60 * 60 * 1000; // 6 hours
    this.autoRenewDaysThreshold = options.autoRenewDaysThreshold ?? 7;
    this.logger = options.logger ?? {
      info: (...args) => console.log("[SocialTokenMonitor]", ...args),
      warn: (...args) => console.warn("[SocialTokenMonitor]", ...args),
      error: (...args) => console.error("[SocialTokenMonitor]", ...args),
    };
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.manager.seedFromEnvironmentIfEmpty().catch((err) => {
      this.logger.error("Failed to seed social accounts from environment", err);
    });

    this.timer = setInterval(() => {
      void this.executeHeartbeat().catch((err) => {
        this.logger.error("Unexpected error during social token heartbeat", err);
      });
    }, this.intervalMs);

    this.logger.info(`Autonomous Social Token Monitor started (interval: ${this.intervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info("Autonomous Social Token Monitor stopped");
    }
  }

  async executeHeartbeat(): Promise<void> {
    if (this.isExecuting) {
      return;
    }
    this.isExecuting = true;

    try {
      this.logger.info("Executing periodic social token health check...");
      await this.manager.performHealthCheck();
      const summary = await this.manager.getTokensSummary();

      for (const account of summary.accounts) {
        const canAutoRenew =
          account.requiresAction &&
          account.actionType === "auto_refresh" &&
          account.daysRemaining !== null &&
          account.daysRemaining <= this.autoRenewDaysThreshold;

        if (canAutoRenew) {
          try {
            this.logger.info(
              `Attempting autonomous token renewal for ${account.platform}/${account.accountId} (expires in ${account.daysRemaining} days)...`,
            );
            await this.manager.autoRefreshAccount(account.platform, account.accountId);
            this.logger.info(
              `Autonomous token renewal successful for ${account.platform}/${account.accountId}`,
            );
          } catch (renewErr: any) {
            this.logger.warn(
              `Autonomous token renewal failed for ${account.platform}/${account.accountId}: ${renewErr?.message}. Operator alert remains active.`,
            );
          }
        }
      }
    } finally {
      this.isExecuting = false;
    }
  }

  async triggerCheck(): Promise<SocialTokensSummaryView> {
    return this.manager.performHealthCheck();
  }
}
