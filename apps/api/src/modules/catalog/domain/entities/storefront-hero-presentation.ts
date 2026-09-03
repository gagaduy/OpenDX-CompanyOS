// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface StorefrontHeroChapterInput {
  readonly categorySlug: string;
  readonly sortOrder: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly label: string;
}

export interface StorefrontHeroImportInput {
  readonly code: string;
  readonly bytes: Uint8Array;
  readonly chapters: readonly StorefrontHeroChapterInput[];
}
