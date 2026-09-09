// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CampaignVisualOverlayInput {
  readonly sourceBuffer: Buffer;
  readonly themeKey: string;
  readonly badgeText: string;
  readonly discountPercent: number;
}

export interface CampaignVisualGenerator {
  generateBadgeOverlay(input: CampaignVisualOverlayInput): Promise<Buffer>;
}
