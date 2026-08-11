// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const audioSceneDefinition = {
  scene: "audio",
  modelId: "headphones",
} as const;

export function AudioScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...audioSceneDefinition}
      position={[-1.35, 0, 0]}
      targetSize={3.1}
      rotation={[-0.45, 0.75]}
    />
  );
}
