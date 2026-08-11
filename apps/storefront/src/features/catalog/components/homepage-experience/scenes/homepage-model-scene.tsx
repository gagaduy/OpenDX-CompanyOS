// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { useMemo, useRef, type MutableRefObject } from "react";
import { homepageModelAssets } from "../../../data/homepage-model-assets";
import { useHomepageModel } from "../../../hooks/use-homepage-model";
import { homepageModelPresentations } from "../../../lib/homepage-model-presentation";
import { normalizeHomepageModel } from "../../../lib/normalize-homepage-model";
import { prepareHomepageModelAppearance } from "../../../lib/prepare-homepage-model-appearance";
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
  side,
  position,
  verticalOffset = 0,
  depthOffset = 0,
  horizontalPositionFraction = 0.22,
  widthFraction,
  accent = false,
}: HomepageSceneProps & {
  readonly scene: HomepageSceneId;
  readonly modelId: HomepageModelId;
  readonly side: "left" | "right";
  readonly position?: readonly [number, number, number];
  readonly verticalOffset?: number;
  readonly depthOffset?: number;
  readonly horizontalPositionFraction?: number;
  readonly widthFraction?: number;
  readonly accent?: boolean;
}) {
  const group = useRef<Group>(null);
  const viewport = useThree((state) => state.viewport);
  const asset = homepageModelAssets.find((candidate) => candidate.id === modelId);
  if (asset === undefined) throw new Error(`Unknown homepage model ${modelId}`);
  const presentation = homepageModelPresentations[modelId];
  const model = useHomepageModel(asset);
  const normalizedScene = useMemo(() => {
    if (model.status !== "ready") return undefined;
    const preparedScene = prepareHomepageModelAppearance(
      model.scene,
      presentation,
      theme,
    );
    return normalizeHomepageModel(
      preparedScene,
      presentation,
      {
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        browserWidth: window.innerWidth,
      },
      widthFraction,
    );
  }, [
    model,
    presentation,
    theme,
    viewport.height,
    viewport.width,
    widthFraction,
  ]);

  const basePosition = position ?? [
    viewport.width *
      (side === "right"
        ? horizontalPositionFraction
        : -horizontalPositionFraction),
    verticalOffset,
    depthOffset,
  ];

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
        [0, presentation.turn[0]],
        [1, presentation.turn[1]],
      ]) + idle;
    group.current.rotation.x = budget.idleMotion
      ? state.pointer.y * 0.07
      : 0;
    group.current.position.x =
      basePosition[0] + (budget.idleMotion ? state.pointer.x * 0.14 : 0);
  });

  return (
    <group
      ref={group}
      name={`${scene}-${modelId}`}
      position={[...basePosition]}
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
        <group rotation={[...presentation.baseRotation]}>
          <group scale={normalizedScene.scale}>
            <primitive
              object={normalizedScene.scene}
              position={[...normalizedScene.centeredPosition]}
              dispose={null}
            />
          </group>
        </group>
      )}
    </group>
  );
}
