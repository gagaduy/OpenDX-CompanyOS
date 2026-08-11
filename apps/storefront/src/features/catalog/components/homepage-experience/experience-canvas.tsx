// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Canvas } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import type { HomepagePreferences } from "../../hooks/use-homepage-preferences";
import { ExperienceErrorBoundary } from "./experience-error-boundary";
import { IntroScene } from "./scenes/intro-scene";
import { ShowroomEnvironment } from "./showroom-environment";

export function ExperienceCanvas({
  progress,
  preferences,
  onFatalError,
}: {
  readonly progress: MutableRefObject<number>;
  readonly preferences: HomepagePreferences;
  readonly onFatalError: () => void;
}) {
  return (
    <div
      className="homepage-experience-canvas"
      data-testid="homepage-canvas-layer"
      data-showroom-theme={preferences.theme}
      aria-hidden="true"
    >
      <ExperienceErrorBoundary onFatalError={onFatalError}>
        <Canvas
          camera={{ position: [0, 0, 7], fov: 42 }}
          dpr={preferences.budget.dpr}
          shadows={preferences.budget.shadows}
          gl={{
            antialias: preferences.tier !== "low",
            powerPreference: "high-performance",
          }}
        >
          <ShowroomEnvironment
            theme={preferences.theme}
            budget={preferences.budget}
          />
          <IntroScene progress={progress} budget={preferences.budget} />
        </Canvas>
      </ExperienceErrorBoundary>
    </div>
  );
}
