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
  readonly campaignLabel: string;
}

const THEME_PALETTES: Record<string, ThemePalette> = {
  mid_autumn: {
    gradientStart: "#b91c1c",
    gradientEnd: "#7f1d1d",
    accentColor: "#facc15",
    textColor: "#ffffff",
    borderColor: "#facc15",
    campaignLabel: "ĐẠI TIỆC TRĂNG RẰM",
  },
  back_to_school: {
    gradientStart: "#1d4ed8",
    gradientEnd: "#1e3a8a",
    accentColor: "#38bdf8",
    textColor: "#ffffff",
    borderColor: "#60a5fa",
    campaignLabel: "MÙA TỰU TRƯỜNG",
  },
  flash_sale: {
    gradientStart: "#c2410c",
    gradientEnd: "#7c2d12",
    accentColor: "#fbbf24",
    textColor: "#ffffff",
    borderColor: "#f97316",
    campaignLabel: "FLASH SALE ĐỘC QUYỀN",
  },
  black_friday: {
    gradientStart: "#18181b",
    gradientEnd: "#09090b",
    accentColor: "#eab308",
    textColor: "#ffffff",
    borderColor: "#eab308",
    campaignLabel: "SIÊU SALE BLACK FRIDAY",
  },
  general: {
    gradientStart: "#4338ca",
    gradientEnd: "#312e81",
    accentColor: "#38bdf8",
    textColor: "#ffffff",
    borderColor: "#6366f1",
    campaignLabel: "ƯU ĐÃI ĐẶC QUYỀN",
  },
};

function renderThemeVectorIcon(themeKey: string, size: number, color: string): string {
  switch (themeKey) {
    case "mid_autumn":
      return `
        <circle cx="${size * 0.5}" cy="${size * 0.45}" r="${size * 0.32}" fill="${color}" />
        <rect x="${size * 0.35}" y="${size * 0.77}" width="${size * 0.3}" height="${size * 0.12}" rx="${size * 0.04}" fill="${color}" />
      `;
    case "flash_sale":
      return `
        <polygon points="${size * 0.55},${size * 0.1} ${size * 0.25},${size * 0.52} ${size * 0.5},${size * 0.52} ${size * 0.42},${size * 0.9} ${size * 0.78},${size * 0.45} ${size * 0.55},${size * 0.45}" fill="${color}" />
      `;
    case "back_to_school":
      return `
        <polygon points="${size * 0.5},${size * 0.2} ${size * 0.88},${size * 0.42} ${size * 0.5},${size * 0.64} ${size * 0.12},${size * 0.42}" fill="${color}" />
        <path d="M${size * 0.25} ${size * 0.52} L${size * 0.25} ${size * 0.72} Q${size * 0.5} ${size * 0.85} ${size * 0.75} ${size * 0.72} L${size * 0.75} ${size * 0.52}" fill="none" stroke="${color}" stroke-width="${size * 0.08}" />
      `;
    case "black_friday":
      return `
        <path d="M${size * 0.25} ${size * 0.15} L${size * 0.6} ${size * 0.15} L${size * 0.85} ${size * 0.4} L${size * 0.55} ${size * 0.85} L${size * 0.15} ${size * 0.45} Z" fill="${color}" />
        <circle cx="${size * 0.38}" cy="${size * 0.32}" r="${size * 0.08}" fill="#000000" />
      `;
    default:
      return `
        <polygon points="${size * 0.5},${size * 0.15} ${size * 0.6},${size * 0.38} ${size * 0.85},${size * 0.4} ${size * 0.65},${size * 0.58} ${size * 0.72},${size * 0.85} ${size * 0.5},${size * 0.7} ${size * 0.28},${size * 0.85} ${size * 0.35},${size * 0.58} ${size * 0.15},${size * 0.4} ${size * 0.4},${size * 0.38}" fill="${color}" />
      `;
  }
}

function cleanBadgeText(rawText: string): string {
  return rawText
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class SharpCampaignVisualAdapter implements CampaignVisualGenerator {
  async generateBadgeOverlay(input: CampaignVisualOverlayInput): Promise<Buffer> {
    const meta = await sharp(input.sourceBuffer, { failOn: "error" }).metadata();
    const width = meta.width ?? 600;
    const height = meta.height ?? 600;

    const palette = THEME_PALETTES[input.themeKey] ?? THEME_PALETTES.general;
    const cleanedText = cleanBadgeText(input.badgeText) || `SALE -${input.discountPercent}%`;

    const badgeHeight = Math.max(36, Math.round(height * 0.085));
    const badgeWidth = Math.min(width * 0.58, 270);
    const paddingLeft = Math.round(width * 0.035);
    const paddingTop = Math.round(height * 0.035);
    const iconSize = Math.round(badgeHeight * 0.65);

    const bottomRibbonHeight = Math.max(40, Math.round(height * 0.095));
    const bottomRibbonY = height - bottomRibbonHeight - Math.round(height * 0.02);

    const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.gradientStart}" />
      <stop offset="100%" stop-color="${palette.gradientEnd}" />
    </linearGradient>
    <linearGradient id="frameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.borderColor}" stop-opacity="0.9" />
      <stop offset="50%" stop-color="${palette.gradientStart}" stop-opacity="0.3" />
      <stop offset="100%" stop-color="${palette.borderColor}" stop-opacity="0.9" />
    </linearGradient>
    <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#090d16" stop-opacity="0.92" />
      <stop offset="60%" stop-color="#0f172a" stop-opacity="0.88" />
      <stop offset="100%" stop-color="${palette.gradientEnd}" stop-opacity="0.94" />
    </linearGradient>
    <filter id="badgeShadow" x="-10%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.5" />
    </filter>
  </defs>

  <!-- Atmospheric E-Commerce Outer Accent Frame -->
  <rect x="6" y="6" width="${width - 12}" height="${height - 12}" rx="16" ry="16"
        fill="none" stroke="url(#frameGrad)" stroke-width="2.5" />

  <!-- Corner Flourishes -->
  <path d="M 12 28 L 12 12 L 28 12" fill="none" stroke="${palette.borderColor}" stroke-width="3" stroke-linecap="round" />
  <path d="M ${width - 28} 12 L ${width - 12} 12 L ${width - 12} 28" fill="none" stroke="${palette.borderColor}" stroke-width="3" stroke-linecap="round" />

  <!-- 3D Floating Pill Badge with Clean Vector Icon -->
  <g filter="url(#badgeShadow)" transform="translate(${paddingLeft}, ${paddingTop})">
    <rect width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" ry="${badgeHeight / 2}"
          fill="url(#badgeGrad)" stroke="${palette.borderColor}" stroke-width="1.5" />
    <!-- Vector Theme Icon -->
    <g transform="translate(${Math.round(badgeHeight * 0.22)}, ${Math.round((badgeHeight - iconSize) / 2)})">
      ${renderThemeVectorIcon(input.themeKey, iconSize, palette.accentColor)}
    </g>
    <!-- Crisp Vector Safe Text -->
    <text x="${badgeHeight * 0.95 + (badgeWidth - badgeHeight * 0.95) / 2}"
          y="${badgeHeight * 0.62}"
          text-anchor="middle"
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif"
          font-size="${Math.round(badgeHeight * 0.40)}px"
          font-weight="bold"
          letter-spacing="0.5px"
          fill="${palette.textColor}">
      ${escapeXml(cleanedText)}
    </text>
  </g>

  <!-- Top-Right Authentic Guarantee Micro-Badge -->
  <g filter="url(#badgeShadow)" transform="translate(${width - paddingLeft - 110}, ${paddingTop})">
    <rect width="110" height="26" rx="13" ry="13"
          fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1" />
    <text x="55" y="17"
          text-anchor="middle"
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif"
          font-size="10px"
          font-weight="bold"
          letter-spacing="0.5px"
          fill="#38bdf8">
      100% CHÍNH HÃNG
    </text>
  </g>

  <!-- High-Converting Bottom Promotional Ribbon Bar -->
  <g filter="url(#badgeShadow)" transform="translate(${paddingLeft}, ${bottomRibbonY})">
    <rect width="${width - paddingLeft * 2}" height="${bottomRibbonHeight}" rx="10" ry="10"
          fill="url(#ribbonGrad)" stroke="${palette.borderColor}" stroke-width="1.2" />
    <!-- Campaign Label Left -->
    <text x="18" y="${bottomRibbonHeight * 0.62}"
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif"
          font-size="${Math.round(bottomRibbonHeight * 0.36)}px"
          font-weight="bold"
          letter-spacing="0.8px"
          fill="${palette.accentColor}">
      ${escapeXml(palette.campaignLabel)}
    </text>
    <!-- Discount Percentage Right -->
    <text x="${width - paddingLeft * 2 - 18}" y="${bottomRibbonHeight * 0.62}"
          text-anchor="end"
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif"
          font-size="${Math.round(bottomRibbonHeight * 0.38)}px"
          font-weight="bold"
          letter-spacing="0.5px"
          fill="#34d399">
      GIẢM ĐẾN -${input.discountPercent}%
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
