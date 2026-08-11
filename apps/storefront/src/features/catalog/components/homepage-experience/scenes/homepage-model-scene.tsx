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
  sceneAtProgress,
} from "../../../lib/homepage-scene-progress";
import type {
  HomepageModelId,
  HomepageSceneId,
} from "../../../types/homepage-experience.types";
import { ModelFallback } from "../model-fallback";

export interface HomepageSceneProps {
  readonly progress: MutableRefObject<number>;
  readonly theme: "dark" | "light";
  readonly budget: ExperienceBudget;
}

export function HomepageModelScene({
  progress,
  theme,
  budget,
  scene,
  modelId,
  position,
  targetSize,
  rotation,
  accent = false,
}: HomepageSceneProps & {
  readonly scene: HomepageSceneId;
  readonly modelId: HomepageModelId;
  readonly position: readonly [number, number, number];
  readonly targetSize: number;
  readonly rotation: readonly [number, number];
  readonly accent?: boolean;
}) {
  const group = useRef<Group>(null);
  const asset = homepageModelAssets.find((candidate) => candidate.id === modelId);
  if (asset === undefined) throw new Error(`Unknown homepage model ${modelId}`);
  const model = useHomepageModel(asset);
  const normalizedScene = useMemo(() => {
    if (model.status !== "ready") return undefined;
    const loadedScene = model.scene;
    const bounds = new Box3().setFromObject(loadedScene);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const longestSide = Math.max(size.x, size.y, size.z, 1);
    loadedScene.position.copy(center.multiplyScalar(-1));
    loadedScene.scale.setScalar(targetSize / longestSide);
    return loadedScene;
  }, [model, targetSize]);

  useFrame((state) => {
    if (group.current === null) return;
    const active = sceneAtProgress(progress.current) === scene;
    group.current.visible = active;
    if (!active) return;
    const localProgress = localSceneProgress(progress.current, scene);
    const idle = budget.idleMotion
      ? Math.sin(state.clock.getElapsedTime() * 0.65) * 0.055
      : 0;
    group.current.rotation.y =
      lerpKeyframes(localProgress, [
        [0, rotation[0]],
        [1, rotation[1]],
      ]) + idle;
    group.current.rotation.x = budget.idleMotion
      ? state.pointer.y * 0.07
      : 0;
    group.current.position.x =
      position[0] + (budget.idleMotion ? state.pointer.x * 0.14 : 0);
  });

  return (
    <group
      ref={group}
      name={`${scene}-${modelId}`}
      position={[...position]}
      visible={scene === "intro"}
    >
      {accent ? (
        <pointLight
          color={theme === "dark" ? "#5e6ad2" : "#b8c0ff"}
          intensity={theme === "dark" ? 8 : 3}
          position={[0, 1, 2]}
        />
      ) : null}
      {normalizedScene === undefined ? (
        model.status === "error" ? <ModelFallback modelId={modelId} /> : null
      ) : (
        <primitive object={normalizedScene} dispose={null} />
      )}
    </group>
  );
}
