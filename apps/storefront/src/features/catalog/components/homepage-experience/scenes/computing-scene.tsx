// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const computingSceneDefinition = {
  scene: "computing",
  modelId: "laptop",
  side: "right",
} as const;

export function ComputingScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...computingSceneDefinition}
      verticalOffset={-0.2}
    />
  );
}
