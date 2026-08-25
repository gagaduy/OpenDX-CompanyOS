// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { HomepageSceneProps } from "./homepage-model-scene";
import { HomepageModelScene } from "./homepage-model-scene";

export function IntroScene(props: HomepageSceneProps) {
  return (
    <HomepageModelScene
      {...props}
      scene="intro"
      modelId="laptop"
      side="right"
      verticalOffset={-0.2}
      accent
    />
  );
}
