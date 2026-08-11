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
        position={[-2.1, 0.75, 0]}
        targetSize={1.55}
        rotation={[-0.5, 0.5]}
      />
      <HomepageModelScene
        {...props}
        scene="featured"
        modelId="laptop"
        position={[-0.7, -0.7, 0]}
        targetSize={1.7}
        rotation={[0.35, -0.3]}
      />
      <HomepageModelScene
        {...props}
        scene="featured"
        modelId="headphones"
        position={[0.9, 0.65, 0]}
        targetSize={1.55}
        rotation={[-0.35, 0.45]}
      />
      <HomepageModelScene
        {...props}
        scene="featured"
        modelId="game-controller"
        position={[2.15, -0.7, 0]}
        targetSize={1.6}
        rotation={[0.5, -0.45]}
      />
    </group>
  );
}
