// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateReplenishmentProposalInput,
  ReplenishmentProposalDto,
  ReplenishmentProposalStatus,
} from "../../dtos/inventory-replenishment.dto";

export interface InventoryReplenishmentRepositoryContract {
  create(proposal: CreateReplenishmentProposalInput): Promise<void>;
  findLatestPending(): Promise<ReplenishmentProposalDto | null>;
  findById(id: string): Promise<ReplenishmentProposalDto | null>;
  updateStatus(id: string, status: ReplenishmentProposalStatus, reviewedBy?: string): Promise<void>;
}
