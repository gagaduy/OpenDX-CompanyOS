// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupportOperationsApi } from "../api/support-api";

afterEach(() => vi.unstubAllGlobals());

describe("Support proposal transport", () => {
  it("posts a proposal cancellation to the authenticated Support endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { id: "proposal-1", status: "canceled" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSupportOperationsApi("http://api.test", "staff-token").cancelSupportProposal("proposal-1"))
      .resolves.toMatchObject({ id: "proposal-1", status: "canceled" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/v1/admin/support/tickets/ai-proposal/proposal-1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
