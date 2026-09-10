// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontHeroChapterInput } from "../entities/storefront-hero-presentation";
import { CatalogDomainError } from "../exceptions/catalog-domain.error";

export function validateStorefrontHeroChapters(
  durationMs: number,
  chapters: readonly StorefrontHeroChapterInput[],
): void {
  assertSafeTimingValues(durationMs, chapters);
  if (durationMs <= 0) {
    throw new CatalogDomainError("Hero video duration must be greater than zero");
  }

  if (chapters.length === 0) {
    throw new CatalogDomainError("Storefront hero chapters are required");
  }

  const categorySlugs = new Set<string>();
  for (const [index, chapter] of chapters.entries()) {
    if (chapter.startMs < 0) {
      throw new CatalogDomainError("Hero chapter start times must be non-negative");
    }
    if (chapter.endMs <= chapter.startMs) {
      throw new CatalogDomainError("Hero chapter end times must be greater than start times");
    }
    if (chapter.sortOrder !== index) {
      throw new CatalogDomainError("Hero chapter sort orders must be contiguous from zero");
    }
    if (categorySlugs.has(chapter.categorySlug)) {
      throw new CatalogDomainError("Hero chapter category slugs must be unique");
    }
    categorySlugs.add(chapter.categorySlug);
    if (chapter.label.trim().length === 0) {
      throw new CatalogDomainError("Hero chapter labels are required");
    }
  }

  const firstChapter = chapters[0]!;
  if (firstChapter.startMs !== 0) {
    throw new CatalogDomainError("Hero chapters must start at zero");
  }

  for (let index = 1; index < chapters.length; index += 1) {
    const previousChapter = chapters[index - 1]!;
    const chapter = chapters[index]!;
    if (chapter.startMs < previousChapter.endMs) {
      throw new CatalogDomainError("Hero chapters must not overlap");
    }
    if (chapter.startMs > previousChapter.endMs) {
      throw new CatalogDomainError("Hero chapters must not contain gaps");
    }
  }

  const finalChapter = chapters.at(-1)!;
  if (finalChapter.endMs !== durationMs) {
    throw new CatalogDomainError("Hero chapters must end at the video duration");
  }
}

function assertSafeTimingValues(
  durationMs: number,
  chapters: readonly StorefrontHeroChapterInput[],
): void {
  const values = [
    durationMs,
    ...chapters.flatMap((chapter) => [chapter.sortOrder, chapter.startMs, chapter.endMs]),
  ];
  if (!values.every(Number.isSafeInteger)) {
    throw new CatalogDomainError("Hero chapter timing values must be safe integers");
  }
}
