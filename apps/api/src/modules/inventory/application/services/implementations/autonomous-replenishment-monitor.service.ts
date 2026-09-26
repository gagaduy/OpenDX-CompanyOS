// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ReplenishmentProposalDto,
  ReplenishmentTriggerSource,
} from "../../dtos/inventory-replenishment.dto";
import type { InventoryReplenishmentRepositoryContract } from "../../repositories/interfaces/inventory-replenishment.repository";
import type { AutonomousReplenishmentMonitorServiceContract } from "../interfaces/autonomous-replenishment-monitor.service";
import type { AiOperationsService } from "./ai-operations.service";

const DEBOUNCE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const PENDING_PROPOSAL_SUPPRESSION_MS = 6 * 60 * 60 * 1000; // 6 hours

export class AutonomousReplenishmentMonitorService
  implements AutonomousReplenishmentMonitorServiceContract
{
  private lastCheckTimestamp = 0;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly aiOperations: AiOperationsService,
    private readonly repository: InventoryReplenishmentRepositoryContract,
    private readonly getTime: () => number = () => Date.now(),
  ) {}

  async triggerScan(
    source: ReplenishmentTriggerSource,
    targetVariantIds?: string[],
  ): Promise<ReplenishmentProposalDto | null> {
    const now = this.getTime();

    // 1. Debounce rapid trigger calls within 15 minutes
    if (now - this.lastCheckTimestamp < DEBOUNCE_COOLDOWN_MS) {
      return null;
    }

    // 2. Check if a recent pending proposal already exists
    const latestPending = await this.repository.findLatestPending();
    if (latestPending) {
      const pendingAge = now - new Date(latestPending.createdAt).getTime();
      if (pendingAge < PENDING_PROPOSAL_SUPPRESSION_MS) {
        return null; // Suppress duplicate alert
      }
    }

    this.lastCheckTimestamp = now;
    return this.aiOperations.generateReplenishmentAnalysis({
      triggerSource: source,
      targetVariantIds,
    });
  }

  startHeartbeat(intervalMs = 6 * 60 * 60 * 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.triggerScan("scheduled_cron").catch((err) => {
        console.error("Autonomous replenishment cron failed:", err);
      });
    }, intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stopHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
