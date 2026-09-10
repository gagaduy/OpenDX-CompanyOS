// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { StorefrontHeroChapterInput } from "../entities/storefront-hero-presentation";
import { validateStorefrontHeroChapters } from "./storefront-hero-rules";

const durationMs = 24_000;

function validChapters(): StorefrontHeroChapterInput[] {
  return [
    { categorySlug: "laptops", sortOrder: 0, startMs: 0, endMs: 4_000, label: "Laptop" },
    { categorySlug: "phones", sortOrder: 1, startMs: 4_000, endMs: 8_000, label: "Phone" },
    { categorySlug: "tablets", sortOrder: 2, startMs: 8_000, endMs: 12_000, label: "Tablet" },
    {
      categorySlug: "smart-watches",
      sortOrder: 3,
      startMs: 12_000,
      endMs: 16_000,
      label: "Smart Watch",
    },
    {
      categorySlug: "computer-components",
      sortOrder: 4,
      startMs: 16_000,
      endMs: 20_000,
      label: "Computer Component",
    },
    {
      categorySlug: "accessories",
      sortOrder: 5,
      startMs: 20_000,
      endMs: 24_000,
      label: "Accessory",
    },
  ];
}

describe("storefront hero chapter rules", () => {
  it("accepts six contiguous chapters spanning the complete video", () => {
    expect(() => validateStorefrontHeroChapters(durationMs, validChapters())).not.toThrow();
  });

  it("rejects an empty chapter list", () => {
    expect(() => validateStorefrontHeroChapters(durationMs, [])).toThrow(
      "Storefront hero chapters are required",
    );
  });

  it.each([0, -1])("rejects a non-positive video duration of %i milliseconds", (duration) => {
    expect(() => validateStorefrontHeroChapters(duration, validChapters())).toThrow(
      "Hero video duration must be greater than zero",
    );
  });

  it("rejects a negative chapter start time", () => {
    const chapters = validChapters();
    chapters[1] = { ...chapters[1]!, startMs: -1 };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapter start times must be non-negative",
    );
  });

  it.each([0, -1])("rejects a chapter end time of %i at or before its start", (endMs) => {
    const chapters = validChapters();
    chapters[0] = { ...chapters[0]!, endMs };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapter end times must be greater than start times",
    );
  });

  it("rejects non-contiguous sort orders", () => {
    const chapters = validChapters();
    chapters[2] = { ...chapters[2]!, sortOrder: 3 };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapter sort orders must be contiguous from zero",
    );
  });

  it("rejects duplicate category slugs", () => {
    const chapters = validChapters();
    chapters[1] = { ...chapters[1]!, categorySlug: "laptops" };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapter category slugs must be unique",
    );
  });

  it("rejects overlapping chapter times", () => {
    const chapters = validChapters();
    chapters[1] = { ...chapters[1]!, startMs: 3_999 };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapters must not overlap",
    );
  });

  it("rejects gaps between chapter times", () => {
    const chapters = validChapters();
    chapters[1] = { ...chapters[1]!, startMs: 4_001 };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapters must not contain gaps",
    );
  });

  it("rejects a first chapter that does not start at zero", () => {
    const chapters = validChapters();
    chapters[0] = { ...chapters[0]!, startMs: 1 };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapters must start at zero",
    );
  });

  it("rejects a final chapter that does not end at the video duration", () => {
    const chapters = validChapters();
    chapters[5] = { ...chapters[5]!, endMs: durationMs - 1 };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapters must end at the video duration",
    );
  });

  it("rejects an empty chapter label", () => {
    const chapters = validChapters();
    chapters[0] = { ...chapters[0]!, label: "   " };

    expect(() => validateStorefrontHeroChapters(durationMs, chapters)).toThrow(
      "Hero chapter labels are required",
    );
  });

  it.each([
    ["duration", Number.MAX_SAFE_INTEGER + 1, (chapters: StorefrontHeroChapterInput[]) => chapters],
    [
      "sort order",
      durationMs,
      (chapters: StorefrontHeroChapterInput[]) => {
        chapters[0] = { ...chapters[0]!, sortOrder: Number.MAX_SAFE_INTEGER + 1 };
        return chapters;
      },
    ],
    [
      "start time",
      durationMs,
      (chapters: StorefrontHeroChapterInput[]) => {
        chapters[0] = { ...chapters[0]!, startMs: Number.MAX_SAFE_INTEGER + 1 };
        return chapters;
      },
    ],
    [
      "end time",
      durationMs,
      (chapters: StorefrontHeroChapterInput[]) => {
        chapters[0] = { ...chapters[0]!, endMs: Number.MAX_SAFE_INTEGER + 1 };
        return chapters;
      },
    ],
  ])("rejects an unsafe %s integer", (_field, candidateDuration, mutate) => {
    expect(() =>
      validateStorefrontHeroChapters(candidateDuration, mutate(validChapters())),
    ).toThrow("Hero chapter timing values must be safe integers");
  });
});
