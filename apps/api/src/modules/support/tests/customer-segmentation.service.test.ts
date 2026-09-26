// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { CustomerSegmentQueryPort } from "../application/ports/customer-segment-query.port";
import { CustomerSegmentationService } from "../application/services/implementations/customer-segmentation.service";
import type { CampaignRecipientItem } from "../domain/entities/email-campaign.entity";

describe("CustomerSegmentationService", () => {
  const mockRecipients: CampaignRecipientItem[] = [
    {
      customerId: "cust-vip-1",
      email: "vip1@example.com",
      fullName: "Nguyễn Văn VIP",
      totalSpentVnd: 15000000,
      orderCount: 5,
      isSelected: true,
    },
    {
      customerId: "cust-normal-2",
      email: "normal2@example.com",
      fullName: "Trần Thị Bình Thường",
      totalSpentVnd: 500000,
      orderCount: 1,
      isSelected: true,
    },
  ];

  const mockPort: CustomerSegmentQueryPort = {
    getCustomersBySegment: vi.fn(async (segment) => {
      if (segment === "vip_customers") {
        return [mockRecipients[0]];
      }
      return mockRecipients;
    }),
    getCustomerCountBySegment: vi.fn(async (segment) => {
      if (segment === "vip_customers") return 1;
      return 2;
    }),
  };

  const service = new CustomerSegmentationService(mockPort);

  it("filters and retrieves VIP customers correctly", async () => {
    const recipients = await service.getRecipientsForSegment("vip_customers");
    expect(recipients).toHaveLength(1);
    expect(recipients[0].customerId).toBe("cust-vip-1");
    expect(recipients[0].totalSpentVnd).toBe(15000000);
    expect(mockPort.getCustomersBySegment).toHaveBeenCalledWith("vip_customers");
  });

  it("retrieves all active customers when all_active_customers is specified", async () => {
    const recipients = await service.getRecipientsForSegment("all_active_customers");
    expect(recipients).toHaveLength(2);
    expect(mockPort.getCustomersBySegment).toHaveBeenCalledWith("all_active_customers");
  });

  it("sanitizes invalid emails and sets isSelected to true by default", async () => {
    const dirtyPort: CustomerSegmentQueryPort = {
      getCustomersBySegment: vi.fn(async () => [
        {
          customerId: "c1",
          email: "valid@example.com",
          fullName: "User Valid",
          totalSpentVnd: 100000,
          orderCount: 1,
          isSelected: false,
        },
        {
          customerId: "c2",
          email: "invalid-email",
          fullName: "User Invalid",
          totalSpentVnd: 0,
          orderCount: 0,
          isSelected: false,
        },
      ]),
      getCustomerCountBySegment: vi.fn(async () => 2),
    };

    const cleaningService = new CustomerSegmentationService(dirtyPort);
    const cleaned = await cleaningService.getRecipientsForSegment("all_active_customers");
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].email).toBe("valid@example.com");
    expect(cleaned[0].isSelected).toBe(true);
  });
});
