// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SocialPublishMediaItem } from "../../ports/social-publisher.port";

export interface ReadMarketingPublicMediaInput {
  readonly assetId: string;
  readonly sourceDigest: string;
  readonly policy: string;
  readonly outputDigest: string;
  readonly expires: number;
  readonly signature: string;
}

export interface MarketingPublicMediaPayload {
  readonly bytes: Buffer;
  readonly mediaType: "image/jpeg";
  readonly outputDigest: string;
}

export interface MarketingPublicMediaService {
  prepareUrl(media: SocialPublishMediaItem): Promise<string>;
  read(input: ReadMarketingPublicMediaInput): Promise<MarketingPublicMediaPayload>;
}

export class MarketingPublicMediaAccessError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Marketing media is unavailable", options);
    this.name = "MarketingPublicMediaAccessError";
  }
}
