// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { HomepageModelId } from "../types/homepage-experience.types";

export type Rotation3 = readonly [x: number, y: number, z: number];

export interface HomepageModelPresentation {
  readonly baseRotation: Rotation3;
  readonly turn: readonly [start: number, end: number];
  readonly desktopWidthFraction: number;
  readonly compactWidthFraction: number;
  readonly maxHeightFraction: number;
}

export interface HomepageModelFitInput {
  readonly modelWidth: number;
  readonly modelHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly widthFraction: number;
  readonly maxHeightFraction: number;
}

export const homepageModelPresentations = {
  smartphone: {
    baseRotation: [-Math.PI / 2, 0.18, 0],
    turn: [-0.18, 0.2],
    desktopWidthFraction: 0.32,
    compactWidthFraction: 0.26,
    maxHeightFraction: 0.52,
  },
  laptop: {
    baseRotation: [0, 0, 0],
    turn: [-0.22, 0.2],
    desktopWidthFraction: 0.34,
    compactWidthFraction: 0.28,
    maxHeightFraction: 0.48,
  },
  headphones: {
    baseRotation: [0, 0, 0],
    turn: [-0.2, 0.24],
    desktopWidthFraction: 0.31,
    compactWidthFraction: 0.25,
    maxHeightFraction: 0.48,
  },
  "game-controller": {
    baseRotation: [-0.18, 0, 0],
    turn: [-0.2, 0.2],
    desktopWidthFraction: 0.32,
    compactWidthFraction: 0.25,
    maxHeightFraction: 0.42,
  },
} as const satisfies Readonly<
  Record<HomepageModelId, HomepageModelPresentation>
>;

export function fitHomepageModelToViewport(
  input: HomepageModelFitInput,
): number {
  const modelWidth = Math.max(Number.EPSILON, input.modelWidth);
  const modelHeight = Math.max(Number.EPSILON, input.modelHeight);
  return Math.min(
    (input.viewportWidth * input.widthFraction) / modelWidth,
    (input.viewportHeight * input.maxHeightFraction) / modelHeight,
  );
}

export function widthFractionForViewport(
  presentation: HomepageModelPresentation,
  viewportWidth: number,
): number {
  return viewportWidth < 768
    ? presentation.compactWidthFraction
    : presentation.desktopWidthFraction;
}
