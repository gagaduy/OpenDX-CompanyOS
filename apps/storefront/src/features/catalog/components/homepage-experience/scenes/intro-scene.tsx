// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useFrame } from "@react-three/fiber";
import { Box3, Group, Vector3 } from "three";
import { useMemo, useRef, type MutableRefObject } from "react";
import { homepageModelAssets } from "../../../data/homepage-model-assets";
import { useHomepageModel } from "../../../hooks/use-homepage-model";
import type { ExperienceBudget } from "../../../lib/homepage-quality";
import {
  lerpKeyframes,
  localSceneProgress,
} from "../../../lib/homepage-scene-progress";
import { ModelFallback } from "../model-fallback";

const laptopAsset = homepageModelAssets[1];

export function IntroScene({
  progress,
  budget,
}: {
  readonly progress: MutableRefObject<number>;
  readonly budget: ExperienceBudget;
}) {
  const group = useRef<Group>(null);
  const model = useHomepageModel(laptopAsset);
  const normalizedScene = useMemo(() => {
    if (model.status !== "ready") return undefined;
    const scene = model.scene;
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const longestSide = Math.max(size.x, size.y, size.z, 1);
    scene.position.copy(center.multiplyScalar(-1));
    scene.scale.setScalar(3.2 / longestSide);
    return scene;
  }, [model]);

  useFrame((state) => {
    if (group.current === null) return;
    const localProgress = localSceneProgress(progress.current, "intro");
    const idle = budget.idleMotion
      ? Math.sin(state.clock.getElapsedTime() * 0.6) * 0.05
      : 0;
    group.current.rotation.y =
      lerpKeyframes(localProgress, [
        [0, -0.55],
        [1, 0.45],
      ]) + idle;
    group.current.rotation.x = budget.idleMotion
      ? state.pointer.y * 0.08
      : 0;
    group.current.position.x = budget.idleMotion
      ? state.pointer.x * 0.18
      : 0;
  });

  return (
    <group ref={group} position={[1.4, -0.15, 0]}>
      {normalizedScene === undefined ? (
        model.status === "error" ? <ModelFallback modelId="laptop" /> : null
      ) : (
        <primitive object={normalizedScene} dispose={null} />
      )}
    </group>
  );
}
