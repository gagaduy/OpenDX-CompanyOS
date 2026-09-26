// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInventoryApi } from "../api/inventory-api";

describe("createInventoryApi replenishment methods", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads pending replenishment proposal and dismisses correctly", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "prop-pending-1",
          triggerSource: "scheduled_cron",
          status: "pending_review",
          summary: "Cần bổ sung kho",
          items: [],
          totalRestockUnits: 20,
          totalEstimatedBudgetVnd: 5000000,
        },
      }),
    });

    const api = createInventoryApi("http://localhost:4000", "mock-token");
    const pending = await api.getPendingReplenishment();

    expect(pending?.id).toBe("prop-pending-1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/v1/admin/inventory/replenishment/pending",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer mock-token",
        }),
      }),
    );

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { status: "dismissed" } }),
    });

    await api.dismissReplenishmentProposal("prop-pending-1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/v1/admin/inventory/replenishment/prop-pending-1/dismiss",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
