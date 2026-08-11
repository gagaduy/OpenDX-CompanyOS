// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  fitHomepageModelToViewport,
  homepageModelPresentations,
  widthFractionForViewport,
} from "../lib/homepage-model-presentation";

describe("homepage model presentation", () => {
  it("turns the smartphone source Z height into an upright screen pose", () => {
    expect(homepageModelPresentations.smartphone.baseRotation).toEqual([
      -Math.PI / 2,
      0,
      0,
    ]);
  });

  it("keeps every standalone model within the approved visual range", () => {
    for (const presentation of Object.values(homepageModelPresentations)) {
      expect(presentation.desktopWidthFraction).toBeGreaterThanOrEqual(0.3);
      expect(presentation.desktopWidthFraction).toBeLessThanOrEqual(0.35);
      expect(presentation.compactWidthFraction).toBeLessThan(
        presentation.desktopWidthFraction,
      );
      expect(Math.abs(presentation.turn[0])).toBeLessThanOrEqual(0.3);
      expect(Math.abs(presentation.turn[1])).toBeLessThanOrEqual(0.3);
    }
  });

  it("uses the tighter width or height constraint", () => {
    expect(
      fitHomepageModelToViewport({
        modelWidth: 2,
        modelHeight: 4,
        viewportWidth: 10,
        viewportHeight: 8,
        widthFraction: 0.32,
        maxHeightFraction: 0.5,
      }),
    ).toBe(1);
  });

  it("selects compact fractions below the existing 768px boundary", () => {
    const presentation = homepageModelPresentations.smartphone;
    expect(widthFractionForViewport(presentation, 767)).toBe(
      presentation.compactWidthFraction,
    );
    expect(widthFractionForViewport(presentation, 768)).toBe(
      presentation.desktopWidthFraction,
    );
  });
});
