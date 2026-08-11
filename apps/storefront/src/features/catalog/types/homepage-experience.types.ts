// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type HomepageSceneId =
  | "intro"
  | "smartphones"
  | "computing"
  | "audio"
  | "gaming"
  | "featured";

export type HomepageModelId =
  | "smartphone"
  | "laptop"
  | "headphones"
  | "game-controller";

export interface HomepageModelAsset {
  readonly id: HomepageModelId;
  readonly path: `/models/homepage/${string}.glb`;
  readonly sourceUrl: `https://${string}`;
  readonly license: "CC0-1.0" | "CC-BY-3.0";
  readonly creator: string;
  readonly sha256: string;
}

export const HOMEPAGE_SCENE_IDS: readonly HomepageSceneId[] = [
  "intro",
  "smartphones",
  "computing",
  "audio",
  "gaming",
  "featured",
];
