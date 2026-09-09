// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import sharp from "sharp";
import type {
  CampaignVisualGenerator,
  CampaignVisualOverlayInput,
} from "../../application/ports/campaign-visual-generator.port";

interface ThemePalette {
  readonly gradientStart: string;
  readonly gradientEnd: string;
  readonly accentColor: string;
  readonly textColor: string;
  readonly borderColor: string;
}

const THEME_PALETTES: Record<string, ThemePalette> = {
  mid_autumn: {
    gradientStart: "#b91c1c",
    gradientEnd: "#7f1d1d",
    accentColor: "#facc15",
    textColor: "#ffffff",
    borderColor: "#facc15",
  },
  back_to_school: {
    gradientStart: "#1d4ed8",
    gradientEnd: "#1e3a8a",
    accentColor: "#fbbf24",
    textColor: "#ffffff",
    borderColor: "#fbbf24",
  },
  flash_sale: {
    gradientStart: "#ea580c",
    gradientEnd: "#9a3412",
    accentColor: "#ffffff",
    textColor: "#ffffff",
    borderColor: "#ffedd5",
  },
  black_friday: {
    gradientStart: "#09090b",
    gradientEnd: "#18181b",
    accentColor: "#eab308",
    textColor: "#ffffff",
    borderColor: "#eab308",
  },
  general: {
    gradientStart: "#4338ca",
    gradientEnd: "#312e81",
    accentColor: "#06b6d4",
    textColor: "#ffffff",
    borderColor: "#38bdf8",
  },
};

export class SharpCampaignVisualAdapter implements CampaignVisualGenerator {
  async generateBadgeOverlay(input: CampaignVisualOverlayInput): Promise<Buffer> {
    const meta = await sharp(input.sourceBuffer, { failOn: "error" }).metadata();
    const width = meta.width ?? 600;
    const height = meta.height ?? 600;

    const palette = THEME_PALETTES[input.themeKey] ?? THEME_PALETTES.general;
    const badgeWidth = Math.min(width * 0.55, 260);
    const badgeHeight = Math.max(38, Math.round(height * 0.08));
    const paddingLeft = Math.round(width * 0.04);
    const paddingTop = Math.round(height * 0.04);

    const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.gradientStart}" />
      <stop offset="100%" stop-color="${palette.gradientEnd}" />
    </linearGradient>
    <linearGradient id="frameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.borderColor}" stop-opacity="0.85" />
      <stop offset="50%" stop-color="${palette.gradientStart}" stop-opacity="0.3" />
      <stop offset="100%" stop-color="${palette.borderColor}" stop-opacity="0.85" />
    </linearGradient>
    <filter id="badgeShadow" x="-10%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Accent Inner Frame -->
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="14" ry="14"
        fill="none" stroke="url(#frameGrad)" stroke-width="3" />

  <!-- 3D Floating Pill Badge -->
  <g filter="url(#badgeShadow)" transform="translate(${paddingLeft}, ${paddingTop})">
    <rect width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" ry="${badgeHeight / 2}"
          fill="url(#badgeGrad)" stroke="${palette.borderColor}" stroke-width="1.5" />
    <text x="${badgeWidth / 2}" y="${badgeHeight * 0.62}"
          text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="${Math.round(badgeHeight * 0.42)}px"
          font-weight="700"
          letter-spacing="0.5px"
          fill="${palette.textColor}">
      ${escapeXml(input.badgeText)}
    </text>
  </g>
</svg>
    `.trim();

    const compositeResult = await sharp(input.sourceBuffer, { failOn: "error" })
      .composite([{ input: Buffer.from(svg, "utf-8"), top: 0, left: 0 }])
      .webp({ quality: 90 })
      .toBuffer();

    return compositeResult;
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return c;
    }
  });
}
