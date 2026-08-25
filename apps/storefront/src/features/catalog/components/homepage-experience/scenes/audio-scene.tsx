// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { HomepageModelScene, type HomepageSceneProps } from "./homepage-model-scene";

export const audioSceneDefinition = {
  scene: "audio",
  modelId: "headphones",
  side: "left",
} as const;

export function AudioScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      {...audioSceneDefinition}
    />
  );
}
