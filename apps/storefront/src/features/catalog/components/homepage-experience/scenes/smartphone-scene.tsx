// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const smartphoneSceneDefinition = {
  scene: "smartphones",
  modelId: "smartphone",
} as const;

export function SmartphoneScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...smartphoneSceneDefinition}
      position={[-1.45, 0, 0]}
      targetSize={3.4}
      rotation={[-0.8, 0.9]}
    />
  );
}
