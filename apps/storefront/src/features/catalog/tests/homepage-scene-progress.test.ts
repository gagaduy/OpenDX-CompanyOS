// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  clampProgress,
  lerpKeyframes,
  localSceneProgress,
  progressForScene,
  sceneAtProgress,
} from "../lib/homepage-scene-progress";
import {
  budgetForTier,
  selectExperienceTier,
} from "../lib/homepage-quality";

describe("homepage scene progress", () => {
  it("clamps progress and selects exact six-scene boundaries", () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(4)).toBe(1);
    expect(sceneAtProgress(-1)).toBe("intro");
    expect(sceneAtProgress(1 / 6)).toBe("smartphones");
    expect(sceneAtProgress(0.999)).toBe("featured");
    expect(sceneAtProgress(4)).toBe("featured");
  });

  it("maps global progress into local scene progress", () => {
    expect(localSceneProgress(progressForScene("gaming"), "gaming")).toBe(0);
    expect(localSceneProgress(1, "featured")).toBe(1);
  });

  it("interpolates sorted numeric keyframes", () => {
    expect(
      lerpKeyframes(0.5, [
        [0, 0],
        [1, 10],
      ]),
    ).toBe(5);
    expect(
      lerpKeyframes(-1, [
        [0, 3],
        [1, 9],
      ]),
    ).toBe(3);
  });
});

describe("homepage experience quality", () => {
  it("selects a tier from WebGL, motion, viewport, memory, and cores", () => {
    expect(
      selectExperienceTier({
        webgl: false,
        reducedMotion: false,
        width: 1440,
        memoryGb: 8,
        cores: 8,
      }),
    ).toBe("static");
    expect(
      selectExperienceTier({
        webgl: true,
        reducedMotion: true,
        width: 1440,
        memoryGb: 8,
        cores: 8,
      }),
    ).toBe("low");
    expect(
      selectExperienceTier({
        webgl: true,
        reducedMotion: false,
        width: 390,
        memoryGb: 4,
        cores: 4,
      }),
    ).toBe("low");
    expect(
      selectExperienceTier({
        webgl: true,
        reducedMotion: false,
        width: 1024,
        memoryGb: 8,
        cores: 8,
      }),
    ).toBe("medium");
    expect(
      selectExperienceTier({
        webgl: true,
        reducedMotion: false,
        width: 1440,
        memoryGb: 8,
        cores: 8,
      }),
    ).toBe("high");
  });

  it("returns exact renderer budgets", () => {
    expect(budgetForTier("high")).toEqual({
      dpr: 1.75,
      shadows: true,
      idleMotion: true,
    });
    expect(budgetForTier("medium")).toEqual({
      dpr: 1.25,
      shadows: false,
      idleMotion: true,
    });
    expect(budgetForTier("low")).toEqual({
      dpr: 1,
      shadows: false,
      idleMotion: false,
    });
    expect(budgetForTier("static")).toEqual({
      dpr: 1,
      shadows: false,
      idleMotion: false,
    });
  });
});
