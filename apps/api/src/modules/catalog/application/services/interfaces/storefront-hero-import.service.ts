// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontHeroImportInput } from "../../../domain/entities/storefront-hero-presentation";

export interface StorefrontHeroImportResult {
  readonly id: string;
  readonly code: string;
  readonly objectKey: string;
  readonly contentDigest: string;
  readonly contentType: "video/mp4";
  readonly byteSize: number;
  readonly durationMs: number;
  readonly chapterCount: number;
}

export interface StorefrontHeroImportServiceContract {
  import(input: StorefrontHeroImportInput): Promise<StorefrontHeroImportResult>;
  disable(code: string): Promise<boolean>;
}
