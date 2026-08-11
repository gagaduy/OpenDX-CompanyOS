// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const gamingSceneDefinition = {
  scene: "gaming",
  modelId: "game-controller",
  side: "right",
  depthOffset: -1.2,
  horizontalPositionFraction: 0.17,
} as const;

export function GamingScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...gamingSceneDefinition}
      verticalOffset={-0.1}
      accent
    />
  );
}
