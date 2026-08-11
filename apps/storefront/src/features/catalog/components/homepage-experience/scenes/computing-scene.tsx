// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const computingSceneDefinition = {
  scene: "computing",
  modelId: "laptop",
} as const;

export function ComputingScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...computingSceneDefinition}
      position={[1.35, -0.2, 0]}
      targetSize={3.3}
      rotation={[0.7, -0.55]}
    />
  );
}
