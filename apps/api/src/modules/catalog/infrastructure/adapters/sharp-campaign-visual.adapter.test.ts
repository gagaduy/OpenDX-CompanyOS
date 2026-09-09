// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { SharpCampaignVisualAdapter } from "./sharp-campaign-visual.adapter";

describe("SharpCampaignVisualAdapter", () => {
  it("generates a high-contrast 3D pill badge overlay on a source image", async () => {
    const adapter = new SharpCampaignVisualAdapter();
    const sourceBuffer = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
    }).png().toBuffer();

    const outputBuffer = await adapter.generateBadgeOverlay({
      sourceBuffer,
      themeKey: "mid_autumn",
      badgeText: "🏮 TẾT TRUNG THU -20%",
      discountPercent: 20,
    });

    const metadata = await sharp(outputBuffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(400);
  });

  it("handles different themes gracefully with context-aware palettes", async () => {
    const adapter = new SharpCampaignVisualAdapter();
    const sourceBuffer = await sharp({
      create: { width: 500, height: 500, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();

    for (const themeKey of ["back_to_school", "flash_sale", "black_friday", "general"]) {
      const outputBuffer = await adapter.generateBadgeOverlay({
        sourceBuffer,
        themeKey,
        badgeText: `SALE -15%`,
        discountPercent: 15,
      });
      const meta = await sharp(outputBuffer).metadata();
      expect(meta.format).toBe("webp");
    }
  });
});
