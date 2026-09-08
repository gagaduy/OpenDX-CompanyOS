// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createMarketingVisualMaterializer } from "./openrouter-marketing-visual.adapter";

const input = {
  campaignId: "campaign-1", versionNumber: 2, storageKey: "marketing/campaign-1/visual_v2.png",
  mediaType: "image/png" as const, width: 1080, height: 1080, altText: "Campaign visual",
  prompt: "Show the Nova smartwatch from the campaign brief, with a green strap.",
};

describe("Marketing image materialization", () => {
  it("requests image output using the full brief, validates and stores real PNG bytes", async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).png().toBuffer();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }] } }] })));
    const storageWriter = vi.fn();
    const materialize = createMarketingVisualMaterializer({ enabled: true, apiKey: "test-key", models: "test/image-model", timeoutMs: 120000, fetcher, storageWriter });
    const result = await materialize(input);
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.modalities).toEqual(["image", "text"]);
    expect(body.messages[0].content).toContain(input.prompt);
    expect(body.models).toEqual(["test/image-model"]);
    const stored = storageWriter.mock.calls[0]![1] as Buffer;
    expect((await sharp(stored).metadata()).format).toBe("png");
    expect(result).toMatchObject({ width: 32, height: 32, byteSize: stored.length, imageDigest: createHash("sha256").update(stored).digest("hex") });
  });

  it("retries once when the provider returns success without a valid image", async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "No image available" } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }] } }] })));
    const storageWriter = vi.fn();
    const materialize = createMarketingVisualMaterializer({ enabled: true, apiKey: "test-key", models: "test/image-model", timeoutMs: 120000, fetcher, storageWriter });

    await expect(materialize(input)).resolves.toMatchObject({ width: 32, height: 32 });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(storageWriter).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Response(JSON.stringify({ error: { message: "private provider details" } }), { status: 429 }),
    new Response(JSON.stringify({ choices: [{ message: { content: "No image available" } }] })),
    new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,YmFk" } }] } }] })),
  ])("rejects unsuccessful or invalid output without storing a placeholder", async (response) => {
    const storageWriter = vi.fn();
    const materialize = createMarketingVisualMaterializer({ enabled: true, apiKey: "test-key", models: "test/image-model", timeoutMs: 120000, fetcher: vi.fn().mockResolvedValue(response), storageWriter });
    await expect(materialize(input)).rejects.toMatchObject({ errorCode: "MARKETING_VISUAL_GENERATION_FAILED" });
    expect(storageWriter).not.toHaveBeenCalled();
  });

  it("fails explicitly when execution is disabled or times out", async () => {
    const storageWriter = vi.fn();
    const fetcher = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const options = { enabled: false, apiKey: "test-key", models: "test/image-model", timeoutMs: 120000, fetcher, storageWriter };
    await expect(createMarketingVisualMaterializer(options)(input)).rejects.toMatchObject({ errorCode: "MARKETING_VISUAL_GENERATION_UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(createMarketingVisualMaterializer({ ...options, enabled: true })(input)).rejects.toMatchObject({ errorCode: "MARKETING_VISUAL_GENERATION_FAILED" });
    expect(storageWriter).not.toHaveBeenCalled();
  });
});
