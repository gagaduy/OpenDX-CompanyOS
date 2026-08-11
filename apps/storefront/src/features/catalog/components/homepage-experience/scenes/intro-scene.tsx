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
      position={[1.35, -0.2, 0]}
      targetSize={3.2}
      rotation={[-0.55, 0.45]}
    />
  );
}
