// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface MarketingPublicMediaVariant {
  readonly bytes: Buffer;
  readonly mediaType: "image/jpeg";
  readonly sourceAssetId: string;
  readonly sourceDigest: string;
  readonly outputDigest: string;
  readonly policyFingerprint: string;
  readonly width: number;
  readonly height: number;
}

export interface WriteMarketingPublicMediaVariant {
  readonly key: string;
  readonly bytes: Buffer;
  readonly sourceAssetId: string;
  readonly sourceDigest: string;
  readonly outputDigest: string;
  readonly policyFingerprint: string;
  readonly width: number;
  readonly height: number;
}

export interface MarketingPublicMediaStoragePort {
  readVariant(key: string): Promise<MarketingPublicMediaVariant | null>;
  writeVariant(input: WriteMarketingPublicMediaVariant): Promise<void>;
}

export class MarketingPublicMediaIntegrityError extends Error {
  constructor() {
    super("Stored Marketing public media variant has invalid provenance");
    this.name = "MarketingPublicMediaIntegrityError";
  }
}
