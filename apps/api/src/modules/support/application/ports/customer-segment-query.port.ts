// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CampaignRecipientItem,
  CustomerSegmentType,
} from "../../domain/entities/email-campaign.entity";

export interface CustomerSegmentQueryPort {
  getCustomersBySegment(
    segment: CustomerSegmentType,
  ): Promise<CampaignRecipientItem[]>;
  getCustomerCountBySegment(segment: CustomerSegmentType): Promise<number>;
}
