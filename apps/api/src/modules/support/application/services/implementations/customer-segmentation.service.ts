// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerSegmentQueryPort } from "../../ports/customer-segment-query.port";
import type {
  CampaignRecipientItem,
  CustomerSegmentType,
} from "../../../domain/entities/email-campaign.entity";

export class CustomerSegmentationService {
  constructor(private readonly queryPort: CustomerSegmentQueryPort) {}

  async getRecipientsForSegment(
    segment: CustomerSegmentType = "all_active_customers",
  ): Promise<CampaignRecipientItem[]> {
    const rawList = await this.queryPort.getCustomersBySegment(segment);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set<string>();

    const sanitized: CampaignRecipientItem[] = [];

    for (const item of rawList) {
      const email = item.email?.trim().toLowerCase();
      if (!email || !emailRegex.test(email) || seenEmails.has(email)) {
        continue;
      }
      seenEmails.add(email);
      sanitized.push({
        ...item,
        email,
        isSelected: true,
      });
    }

    return sanitized;
  }
}
