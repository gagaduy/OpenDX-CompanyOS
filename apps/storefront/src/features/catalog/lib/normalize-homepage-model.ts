// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Box3, Euler, Matrix4, Vector3, type Object3D } from "three";
import {
  fitHomepageModelToViewport,
  widthFractionForViewport,
  type HomepageModelPresentation,
} from "./homepage-model-presentation";

export interface HomepageModelViewport {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly browserWidth: number;
}

export interface NormalizedHomepageModel {
  readonly scene: Object3D;
  readonly centeredPosition: readonly [number, number, number];
  readonly orientedWidth: number;
  readonly orientedHeight: number;
  readonly scale: number;
}

export function normalizeHomepageModel(
  scene: Object3D,
  presentation: HomepageModelPresentation,
  viewport: HomepageModelViewport,
  widthFractionOverride?: number,
): NormalizedHomepageModel {
  const bounds = new Box3().setFromObject(scene);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const centeredBounds = new Box3(
    size.clone().multiplyScalar(-0.5),
    size.clone().multiplyScalar(0.5),
  );
  const orientation = new Matrix4().makeRotationFromEuler(
    new Euler(...presentation.baseRotation),
  );
  const orientedSize = centeredBounds
    .applyMatrix4(orientation)
    .getSize(new Vector3());
  const widthFraction =
    widthFractionOverride ??
    widthFractionForViewport(presentation, viewport.browserWidth);

  return {
    scene,
    centeredPosition: [-center.x, -center.y, -center.z],
    orientedWidth: orientedSize.x,
    orientedHeight: orientedSize.y,
    scale: fitHomepageModelToViewport({
      modelWidth: orientedSize.x,
      modelHeight: orientedSize.y,
      viewportWidth: viewport.viewportWidth,
      viewportHeight: viewport.viewportHeight,
      widthFraction,
      maxHeightFraction: presentation.maxHeightFraction,
    }),
  };
}
