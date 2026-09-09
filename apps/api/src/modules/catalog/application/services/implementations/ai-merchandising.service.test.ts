// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { AiMerchandisingService } from "./ai-merchandising.service";

describe("AiMerchandisingService Campaign Engine", () => {
  it("calculates exact discount prices and extracts duration from prompt", async () => {
    const mockTx = {
      runReadOnly: vi.fn().mockImplementation(async (cb) => cb({
        query: vi.fn().mockResolvedValue({
          rows: [{
            product_id: "p-1",
            name: "Nova Laptop",
            slug: "nova-laptop",
            description: "Desc",
            category_name: "Laptops",
            variant_id: "v-1",
            sku: "SKU-1",
            price_minor: "30000000",
            storage_key: "products/p-1/image.jpg",
          }],
        }),
      })),
      run: vi.fn().mockImplementation(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
    };

    const mockAudit = { append: vi.fn().mockResolvedValue(undefined) };
    const mockVisual = { generateBadgeOverlay: vi.fn().mockResolvedValue(Buffer.from("webp-data")) };
    const mockStorage = {
      get: vi.fn().mockResolvedValue(Buffer.from("image")),
      upload: vi.fn().mockResolvedValue(undefined),
    };
    const mockRepo = {
      createCampaign: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      findActive: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      mockAudit as any,
      mockVisual as any,
      mockStorage as any,
      mockRepo as any,
    );

    const proposal = await service.generateCampaignProposal({
      prompt: "Giảm giá 20% laptop nhân dịp Trung Thu trong 5 ngày",
    });

    expect(proposal.discountPercent).toBe(20);
    expect(proposal.durationDays).toBe(5);
    expect(proposal.items[0]?.campaignPriceVnd).toBe(24000000);
    expect(proposal.themeKey).toBe("mid_autumn");
    expect(mockRepo.createCampaign).toHaveBeenCalled();
  });

  it("activates campaign inserting time-bounded prices and updates status", async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{
        id: "camp-1",
        name: "Test Campaign",
        status: "draft",
        start_time: new Date(),
        end_time: new Date(Date.now() + 86400000),
      }],
    });
    const mockTx = {
      runReadOnly: vi.fn(),
      run: vi.fn().mockImplementation(async (cb) => cb({ query: queryFn })),
    };

    const mockRepo = {
      createCampaign: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: "camp-1",
        status: "draft",
        name: "Test",
        slug: "test",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
        items: [{
          id: "item-1",
          productId: "p-1",
          variantId: "v-1",
          campaignPriceVnd: 24000000,
          badge: "SALE -20%",
          campaignMediaUrl: "/v1/admin/catalog/media-content?key=campaigns/c1/v1.webp",
        }],
      }),
      findActive: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn().mockResolvedValue(undefined) } as any,
      undefined,
      undefined,
      mockRepo as any,
    );

    const result = await service.activateCampaign("camp-1", {
      actorId: "staff-1",
      correlationId: "corr-1",
    });

    expect(result.success).toBe(true);
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(expect.anything(), "camp-1", "active");
  });

  it("reverts campaign expiring active prices", async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [] });
    const mockTx = {
      runReadOnly: vi.fn(),
      run: vi.fn().mockImplementation(async (cb) => cb({ query: queryFn })),
    };

    const mockRepo = {
      createCampaign: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: "camp-1",
        status: "active",
        items: [{ id: "item-1", productId: "p-1", variantId: "v-1", originalMediaUrl: "products/p-1/img.jpg" }],
      }),
      findActive: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn().mockResolvedValue(undefined) } as any,
      undefined,
      undefined,
      mockRepo as any,
    );

    const result = await service.revertCampaign("camp-1", {
      actorId: "staff-1",
      correlationId: "corr-2",
    });

    expect(result.success).toBe(true);
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(expect.anything(), "camp-1", "reverted");
  });

  it("retrieves active campaign or returns null if expired", async () => {
    const mockTx = {
      runReadOnly: vi.fn().mockImplementation(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
      run: vi.fn().mockImplementation(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
    };

    const mockRepo = {
      createCampaign: vi.fn(),
      getById: vi.fn(),
      findActive: vi.fn().mockResolvedValue({
        id: "camp-active",
        name: "Active Sale",
        badgeText: "SALE",
        discountPercent: 20,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 500000).toISOString(),
        totalProducts: 5,
        remainingMs: 500000,
      }),
      updateStatus: vi.fn(),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn().mockResolvedValue(undefined) } as any,
      undefined,
      undefined,
      mockRepo as any,
    );

    const active = await service.getActiveCampaign();
    expect(active?.id).toBe("camp-active");
    expect(active?.discountPercent).toBe(20);
  });

  it("filters specific products matching user prompt keywords or synonyms", async () => {
    const mockTx = {
      runReadOnly: vi.fn().mockImplementation(async (cb) => cb({
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              product_id: "p-1",
              name: "Nova Laptop Pro",
              slug: "laptop-pro",
              description: "Desc",
              category_name: "Laptops",
              variant_id: "v-1",
              sku: "SKU-1",
              price_minor: "30000000",
              storage_key: null,
            },
            {
              product_id: "p-2",
              name: "Nova Wireless Mouse",
              slug: "wireless-mouse",
              description: "Desc",
              category_name: "Accessories",
              variant_id: "v-2",
              sku: "SKU-2",
              price_minor: "1000000",
              storage_key: null,
            },
          ],
        }),
      })),
      run: vi.fn().mockImplementation(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
    };

    const mockRepo = {
      createCampaign: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      findActive: vi.fn(),
      updateStatus: vi.fn(),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn().mockResolvedValue(undefined) } as any,
      { generateBadgeOverlay: vi.fn() } as any,
      { get: vi.fn(), upload: vi.fn() } as any,
      mockRepo as any,
    );

    // Prompt specifically mentions "chuột" (mouse)
    const proposal = await service.generateCampaignProposal({
      prompt: "Giảm giá 30% cho chuột máy tính trong 3 ngày",
    });

    expect(proposal.items).toHaveLength(1);
    expect(proposal.items[0]?.productId).toBe("p-2");
    expect(proposal.items[0]?.campaignPriceVnd).toBe(700000);
  });
});
