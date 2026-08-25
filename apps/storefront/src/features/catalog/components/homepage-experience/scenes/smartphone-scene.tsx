// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const smartphoneSceneDefinition = {
  scene: "smartphones",
  modelId: "smartphone",
  side: "left",
  accent: true,
} as const;

export function SmartphoneScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...smartphoneSceneDefinition}
    />
  );
}
