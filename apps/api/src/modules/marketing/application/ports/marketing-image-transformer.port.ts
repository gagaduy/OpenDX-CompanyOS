// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface MarketingJpegVariant {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256Digest: string;
}

export interface MarketingImageTransformerPort {
  toJpeg(source: Buffer, quality: number): Promise<MarketingJpegVariant>;
}
