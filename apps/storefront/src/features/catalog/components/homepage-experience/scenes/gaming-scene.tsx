// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const gamingSceneDefinition = {
  scene: "gaming",
  modelId: "game-controller",
} as const;

export function GamingScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...gamingSceneDefinition}
      position={[1.25, -0.1, 0]}
      targetSize={3.2}
      rotation={[-0.75, 0.8]}
      accent
    />
  );
}
