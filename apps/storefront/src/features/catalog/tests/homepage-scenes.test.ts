// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { audioSceneDefinition } from "../components/homepage-experience/scenes/audio-scene";
import { computingSceneDefinition } from "../components/homepage-experience/scenes/computing-scene";
import { featuredSceneDefinition } from "../components/homepage-experience/scenes/featured-scene";
import { gamingSceneDefinition } from "../components/homepage-experience/scenes/gaming-scene";
import { smartphoneSceneDefinition } from "../components/homepage-experience/scenes/smartphone-scene";

describe("homepage 3D scene composition", () => {
  it("maps each commerce scene to the approved local model", () => {
    expect([
      smartphoneSceneDefinition,
      computingSceneDefinition,
      audioSceneDefinition,
      gamingSceneDefinition,
    ]).toEqual([
      { scene: "smartphones", modelId: "smartphone" },
      { scene: "computing", modelId: "laptop" },
      { scene: "audio", modelId: "headphones" },
      { scene: "gaming", modelId: "game-controller" },
    ]);
  });

  it("stages all four approved models in the featured scene", () => {
    expect(featuredSceneDefinition).toEqual({
      scene: "featured",
      modelIds: ["smartphone", "laptop", "headphones", "game-controller"],
    });
  });
});
