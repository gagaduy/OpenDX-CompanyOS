// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const featuredSceneDefinition = {
  scene: "featured",
  modelIds: ["smartphone", "laptop", "headphones", "game-controller"],
} as const;

export function FeaturedScene(props: HomepageSceneProps) {
  return (
    <group name="featured-model-group">
      <HomepageModelScene
        {...props}
        scene="featured"
        modelId="smartphone"
        side="left"
        position={[-2.1, 0.75, 0]}
        widthFraction={0.12}
      />
      <HomepageModelScene
        {...props}
        scene="featured"
        modelId="laptop"
        side="left"
        position={[-0.7, -0.7, 0]}
        widthFraction={0.12}
      />
      <HomepageModelScene
        {...props}
        scene="featured"
        modelId="headphones"
        side="right"
        position={[0.9, 0.65, 0]}
        widthFraction={0.12}
      />
      <HomepageModelScene
        {...props}
        scene="featured"
        modelId="game-controller"
        side="right"
        position={[2.15, -0.7, 0]}
        widthFraction={0.12}
      />
    </group>
  );
}
