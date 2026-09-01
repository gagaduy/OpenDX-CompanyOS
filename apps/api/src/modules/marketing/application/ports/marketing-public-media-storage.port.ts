// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface MarketingPublicMediaVariant {
  readonly bytes: Buffer;
  readonly mediaType: "image/jpeg";
}

export interface WriteMarketingPublicMediaVariant {
  readonly key: string;
  readonly bytes: Buffer;
  readonly sourceAssetId: string;
  readonly sourceDigest: string;
  readonly outputDigest: string;
  readonly width: number;
  readonly height: number;
}

export interface MarketingPublicMediaStoragePort {
  readVariant(key: string): Promise<MarketingPublicMediaVariant | null>;
  writeVariant(input: WriteMarketingPublicMediaVariant): Promise<void>;
}
