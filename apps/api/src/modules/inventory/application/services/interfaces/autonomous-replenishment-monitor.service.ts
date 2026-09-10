// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ReplenishmentProposalDto,
  ReplenishmentTriggerSource,
} from "../../dtos/inventory-replenishment.dto";

export interface AutonomousReplenishmentMonitorServiceContract {
  triggerScan(
    source: ReplenishmentTriggerSource,
    targetVariantIds?: string[],
  ): Promise<ReplenishmentProposalDto | null>;
  startHeartbeat(intervalMs?: number): void;
  stopHeartbeat(): void;
}
