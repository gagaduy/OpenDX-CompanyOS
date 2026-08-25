// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {} from "@react-three/fiber";
import type { HomepageModelId } from "../../types/homepage-experience.types";

export function ModelFallback({ modelId }: { readonly modelId: HomepageModelId }) {
  const elongated = modelId === "laptop" || modelId === "game-controller";
  return (
    <group name={`${modelId}-fallback`}>
      <mesh scale={elongated ? [1.8, 0.35, 1] : [0.8, 1.4, 0.25]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#777b84" roughness={0.55} metalness={0.3} />
      </mesh>
      <mesh position={[0, elongated ? 0.35 : -0.5, 0.2]} scale={0.28}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#5e6ad2" roughness={0.4} />
      </mesh>
    </group>
  );
}
