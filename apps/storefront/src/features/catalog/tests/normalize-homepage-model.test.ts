// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { BoxGeometry, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { homepageModelPresentations } from "../lib/homepage-model-presentation";
import { normalizeHomepageModel } from "../lib/normalize-homepage-model";

describe("homepage model normalization", () => {
  it("orients the smartphone upright before fitting it to the viewport", () => {
    const phone = new Mesh(new BoxGeometry(1, 0.1, 2));
    const normalized = normalizeHomepageModel(
      phone,
      homepageModelPresentations.smartphone,
      {
        viewportWidth: 10,
        viewportHeight: 8,
        browserWidth: 1_440,
      },
    );

    expect(normalized.orientedHeight).toBeGreaterThan(
      normalized.orientedWidth,
    );
    expect(normalized.centeredPosition).toEqual([-0, -0, -0]);
    expect(normalized.orientedWidth * normalized.scale).toBeLessThanOrEqual(
      10 * 0.32,
    );
    expect(normalized.orientedHeight * normalized.scale).toBeLessThanOrEqual(
      8 * 0.52,
    );
  });

  it("uses the compact fraction and height cap without cropping", () => {
    const controller = new Mesh(new BoxGeometry(6, 1.5, 4));
    const normalized = normalizeHomepageModel(
      controller,
      homepageModelPresentations["game-controller"],
      {
        viewportWidth: 5,
        viewportHeight: 8,
        browserWidth: 390,
      },
    );

    expect(normalized.orientedWidth * normalized.scale).toBeLessThanOrEqual(
      5 * 0.25,
    );
    expect(normalized.orientedHeight * normalized.scale).toBeLessThanOrEqual(
      8 * 0.42,
    );
  });
});
