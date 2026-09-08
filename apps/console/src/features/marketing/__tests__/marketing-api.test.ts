// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarketingApi } from "../api/marketing-api";

describe("Marketing visual API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the selected asset as an authenticated blob with cancellation", async () => {
    const blob = new Blob(["rendered-image"], { type: "image/png" });
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const api = createMarketingApi("https://api.example.test", "test-token");
    expect(await api.fetchVisualAssetBlob("asset-2", controller.signal)).toBe(blob);
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/v1/admin/marketing/visual-assets/asset-2/preview", expect.objectContaining({
      signal: controller.signal, headers: expect.objectContaining({ authorization: "Bearer test-token" }),
    }));
    fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(api.fetchVisualAssetBlob("asset-2")).rejects.toThrow("503");
  });
});
