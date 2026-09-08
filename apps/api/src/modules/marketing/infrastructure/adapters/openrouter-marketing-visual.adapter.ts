// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { MarketingCampaignServiceOptions } from "../../application/services/implementations/marketing-campaign.service";
import { MarketingApplicationError } from "../../presentation/middleware/marketing-error.middleware";

interface VisualMaterializerOptions {
  readonly enabled: boolean;
  readonly apiKey?: string;
  readonly models: string;
  readonly timeoutMs: number;
  readonly fetcher?: typeof fetch;
  readonly storageWriter: (key: string, buffer: Buffer, mediaType: string) => Promise<void>;
}

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({
    images: z.array(z.union([
      z.string(),
      z.object({ image_url: z.object({ url: z.string() }).optional(), url: z.string().optional() }),
    ])).optional(),
  }) })).min(1),
});

export function createMarketingVisualMaterializer(options: VisualMaterializerOptions): NonNullable<MarketingCampaignServiceOptions["materializeVisualAsset"]> {
  const models = z.array(z.string().trim().min(1)).min(1).parse(options.models.split(","));
  const timeoutMs = z.number().int().min(1000).max(300000).parse(options.timeoutMs);
  const fetcher = options.fetcher ?? fetch;
  return async (input) => {
    if (!options.enabled || !options.apiKey?.trim()) {
      throw new MarketingApplicationError(503, "MARKETING_VISUAL_GENERATION_UNAVAILABLE", "Image generation is not configured or enabled.");
    }
    let buffer: Buffer;
    let width: number;
    let height: number;
    try {
      const response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          models,
          modalities: ["image", "text"],
          image_config: { aspect_ratio: "1:1" },
          messages: [{ role: "user", content: `Generate a finished commercial product image for this campaign. Follow the supplied product and revision requirements; do not substitute a different product or return a plain background. Use clear product details and a balanced square composition. Do not invent promotional claims or prices.\n\n${input.prompt || input.altText}` }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new MarketingApplicationError(502, "MARKETING_VISUAL_GENERATION_FAILED", `Image provider returned HTTP ${response.status}. No image was saved.`);
      }
      const data = responseSchema.parse(await response.json());
      const first = data.choices[0]!.message.images?.[0];
      const url = typeof first === "string" ? first : first?.image_url?.url ?? first?.url;
      const match = url?.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/);
      if (!match || match[1]!.length > 28_000_000) throw new Error("No supported image returned");
      const decoded = Buffer.from(match[1]!.replace(/\s/g, ""), "base64");
      const result = await sharp(decoded, { failOn: "error", limitInputPixels: 20_000_000 })
        .rotate().png().toBuffer({ resolveWithObject: true });
      buffer = result.data;
      width = result.info.width;
      height = result.info.height;
    } catch (error) {
      if (error instanceof MarketingApplicationError) throw error;
      throw new MarketingApplicationError(502, "MARKETING_VISUAL_GENERATION_FAILED", "Image generation timed out or returned no valid image. No image was saved.");
    }

    await options.storageWriter(input.storageKey, buffer, "image/png");
    return { width, height, byteSize: buffer.length, imageDigest: createHash("sha256").update(buffer).digest("hex") };
  };
}
