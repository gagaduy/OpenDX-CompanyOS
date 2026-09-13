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
      findAllActive: vi.fn().mockResolvedValue([{
        id: "camp-active",
        name: "Active Sale",
        badgeText: "SALE",
        discountPercent: 20,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 500000).toISOString(),
        totalProducts: 5,
        remainingMs: 500000,
      }]),
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

  it("retrieves campaign details by id", async () => {
    const mockTx = {
      runReadOnly: vi.fn().mockImplementation(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
    };

    const mockRepo = {
      getById: vi.fn().mockResolvedValue({
        id: "camp-123",
        name: "Test Campaign",
        badgeText: "HOT",
        discountPercent: 15,
        items: [],
      }),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn().mockResolvedValue(undefined) } as any,
      undefined,
      undefined,
      mockRepo as any,
    );

    const result = await service.getCampaign("camp-123");
    expect(result?.id).toBe("camp-123");
    expect(result?.name).toBe("Test Campaign");
    expect(mockRepo.getById).toHaveBeenCalledWith(expect.anything(), "camp-123");
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

  it("applies campaign proposal seamlessly when proposalId points to a campaign record", async () => {
    const mockTx = {
      runReadOnly: vi.fn().mockImplementation(async (cb) => cb({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      })),
      run: vi.fn().mockImplementation(async (cb) => cb({
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: "camp-legacy-1",
            name: "Test Camp",
            status: "draft",
            start_time: new Date(),
            end_time: new Date(Date.now() + 86400000),
          }],
        }),
      })),
    };

    const mockRepo = {
      createCampaign: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: "camp-legacy-1",
        status: "draft",
        name: "Test Camp",
        slug: "test-camp",
        discountPercent: 18,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
        items: [{
          id: "item-1",
          productId: "p-1",
          variantId: "v-1",
          originalPriceVnd: 30000000,
          campaignPriceVnd: 24600000,
          optimizedTitle: "Laptop Nova Back to School",
          optimizedDescription: "Desc",
          badge: "SALE -18%",
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

    const result = await service.applyProposal(
      { proposalId: "camp-legacy-1" },
      { actorId: "staff-test", correlationId: "corr-legacy" },
    );

    expect(result.success).toBe(true);
    expect(result.proposalId).toBe("camp-legacy-1");
    expect(result.updatedCount).toBe(1);
    expect(result.items[0]?.newPriceVnd).toBe(24600000);
    expect(result.items[0]?.discountPercent).toBe(18);
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(expect.anything(), "camp-legacy-1", "active");
  });

  it("synchronizes multiple active campaigns in chronological order so newest campaign takes precedence", async () => {
    const executedQueries: Array<{ sql: string; values?: any[] }> = [];
    const mockTx = {
      runReadOnly: vi.fn(),
      run: vi.fn().mockImplementation(async (cb) => cb({
        query: vi.fn().mockImplementation(async (sql, values) => {
          executedQueries.push({ sql, values });
          if (sql.includes("status = 'active' AND end_time <= NOW()")) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
      })),
    };

    const mockRepo = {
      createCampaign: vi.fn(),
      getById: vi.fn(),
      findActive: vi.fn(),
      findAllActive: vi.fn().mockResolvedValue([
        {
          id: "camp-newest",
          name: "Flash Sale",
          badgeText: "FLASH SALE",
          discountPercent: 20,
          startTime: "2026-09-13T11:00:00.000Z",
          endTime: "2026-09-20T11:00:00.000Z",
          totalProducts: 10,
          remainingMs: 600000,
        },
        {
          id: "camp-oldest",
          name: "Old Campaign",
          badgeText: "OLD SALE",
          discountPercent: 10,
          startTime: "2026-09-10T10:00:00.000Z",
          endTime: "2026-09-17T10:00:00.000Z",
          totalProducts: 10,
          remainingMs: 400000,
        },
      ]),
      updateStatus: vi.fn(),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn() } as any,
      undefined,
      undefined,
      mockRepo as any,
    );

    const active = await service.getActiveCampaign();
    expect(active?.id).toBe("camp-newest");

    // Verify camp-oldest was processed first and camp-newest was processed last in update queries
    const updateMediaQueries = executedQueries.filter(
      (q) => q.sql.includes("UPDATE product_media pm") && q.sql.includes("SET object_key = mci.campaign_media_storage_key"),
    );
    expect(updateMediaQueries).toHaveLength(2);
    expect(updateMediaQueries[0]?.values?.[0]).toBe("camp-oldest");
    expect(updateMediaQueries[1]?.values?.[0]).toBe("camp-newest");
  });

  it("activates campaign with conflictResolution 'replace' expiring prior active prices", async () => {
    const executedQueries: Array<{ sql: string; values?: any[] }> = [];
    const mockTx = {
      runReadOnly: vi.fn(),
      run: vi.fn().mockImplementation(async (cb) =>
        cb({
          query: vi.fn().mockImplementation(async (sql, values) => {
            executedQueries.push({ sql, values });
            return { rows: [] };
          }),
        }),
      ),
    };

    const mockRepo = {
      createCampaign: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: "camp-replace",
        status: "draft",
        name: "Replace Campaign",
        slug: "replace-camp",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
        items: [
          {
            id: "item-1",
            productId: "p-1",
            variantId: "v-1",
            campaignPriceVnd: 20000000,
            badge: "SALE -20%",
            conflictedCampaign: {
              id: "camp-existing",
              name: "Existing Campaign",
              endTime: new Date(Date.now() + 172800000).toISOString(),
              remainingDays: 2,
            },
          },
        ],
      }),
      findActive: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn() } as any,
      undefined,
      undefined,
      mockRepo as any,
    );

    const res = await service.activateCampaign(
      "camp-replace",
      { actorId: "actor-1", correlationId: "corr-1" },
      { conflictResolution: "replace" },
    );

    expect(res.success).toBe(true);

    // Verify product_prices valid_to = NOW() was executed to expire prior active prices
    const expirePriceQuery = executedQueries.find(
      (q) => q.sql.includes("UPDATE product_prices") && q.sql.includes("SET valid_to = NOW()"),
    );
    expect(expirePriceQuery).toBeDefined();
    expect(expirePriceQuery?.values?.[0]).toBe("v-1");

    // Verify campaign status updated to active
    const updateCampaignQuery = executedQueries.find(
      (q) => q.sql.includes("UPDATE merchandising_campaigns") && q.sql.includes("SET status = $1"),
    );
    expect(updateCampaignQuery?.values?.[0]).toBe("active");
  });

  it("activates campaign with conflictResolution 'schedule_after' setting scheduled status and shifting dates", async () => {
    const executedQueries: Array<{ sql: string; values?: any[] }> = [];
    const mockTx = {
      runReadOnly: vi.fn(),
      run: vi.fn().mockImplementation(async (cb) =>
        cb({
          query: vi.fn().mockImplementation(async (sql, values) => {
            executedQueries.push({ sql, values });
            return { rows: [] };
          }),
        }),
      ),
    };

    const conflictEndMs = Date.now() + 172800000;
    const mockRepo = {
      createCampaign: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: "camp-sched",
        status: "draft",
        name: "Scheduled Campaign",
        slug: "scheduled-camp",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
        items: [
          {
            id: "item-1",
            productId: "p-1",
            variantId: "v-1",
            campaignPriceVnd: 20000000,
            badge: "SALE -20%",
            conflictedCampaign: {
              id: "camp-existing",
              name: "Existing Campaign",
              endTime: new Date(conflictEndMs).toISOString(),
              remainingDays: 2,
            },
          },
        ],
      }),
      findActive: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AiMerchandisingService(
      mockTx as any,
      { append: vi.fn() } as any,
      undefined,
      undefined,
      mockRepo as any,
    );

    const res = await service.activateCampaign(
      "camp-sched",
      { actorId: "actor-1", correlationId: "corr-1" },
      { conflictResolution: "schedule_after" },
    );

    expect(res.success).toBe(true);

    // Verify product_prices valid_to = NOW() was NOT called
    const expirePriceQuery = executedQueries.find(
      (q) => q.sql.includes("UPDATE product_prices") && q.sql.includes("SET valid_to = NOW()"),
    );
    expect(expirePriceQuery).toBeUndefined();

    // Verify campaign status was set to scheduled with shifted start_time
    const updateCampaignQuery = executedQueries.find(
      (q) => q.sql.includes("UPDATE merchandising_campaigns") && q.sql.includes("SET status = $1"),
    );
    expect(updateCampaignQuery?.values?.[0]).toBe("scheduled");
    expect((updateCampaignQuery?.values?.[1] as Date).getTime()).toBe(conflictEndMs);

    // Verify products attributes were NOT updated immediately because it is scheduled
    const updateProductAttrQuery = executedQueries.find(
      (q) => q.sql.includes("UPDATE products") && q.sql.includes("SET attributes = attributes || $1::jsonb"),
    );
    expect(updateProductAttrQuery).toBeUndefined();
  });
});
