// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  HOMEPAGE_SCENE_IDS,
  type HomepageSceneId,
} from "../types/homepage-experience.types";

export type NumericKeyframe = readonly [progress: number, value: number];

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function sceneAtProgress(progress: number): HomepageSceneId {
  const index = Math.min(
    HOMEPAGE_SCENE_IDS.length - 1,
    Math.floor(clampProgress(progress) * HOMEPAGE_SCENE_IDS.length),
  );
  return HOMEPAGE_SCENE_IDS[index] ?? "intro";
}

export function progressForScene(scene: HomepageSceneId): number {
  const index = HOMEPAGE_SCENE_IDS.indexOf(scene);
  return index / HOMEPAGE_SCENE_IDS.length;
}

export function localSceneProgress(
  progress: number,
  scene: HomepageSceneId,
): number {
  const sceneStart = progressForScene(scene);
  const clamped = clampProgress(progress);
  const sceneEnd = sceneStart + 1 / HOMEPAGE_SCENE_IDS.length;
  if (clamped <= sceneStart) return 0;
  if (clamped >= sceneEnd || clamped === 1) return 1;
  return (clamped - sceneStart) * HOMEPAGE_SCENE_IDS.length;
}

export function lerpKeyframes(
  progress: number,
  keyframes: readonly NumericKeyframe[],
): number {
  if (keyframes.length === 0) return 0;
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (progress <= first[0]) return first[1];
  if (progress >= last[0]) return last[1];

  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index];
    const left = keyframes[index - 1];
    if (left === undefined || right === undefined || progress > right[0]) {
      continue;
    }
    const range = right[0] - left[0];
    if (range <= 0) return right[1];
    const localProgress = (progress - left[0]) / range;
    return left[1] + (right[1] - left[1]) * localProgress;
  }

  return last[1];
}
