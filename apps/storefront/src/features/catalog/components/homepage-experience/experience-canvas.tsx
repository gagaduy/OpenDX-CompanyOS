// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Canvas } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useDocumentVisibility } from "../../hooks/use-document-visibility";
import { useHomepagePreload } from "../../hooks/use-homepage-preload";
import type { HomepagePreferences } from "../../hooks/use-homepage-preferences";
import type { HomepagePreloadStage } from "../../types/homepage-experience.types";
import { ExperienceErrorBoundary } from "./experience-error-boundary";
import { ExperienceLoadingStatus } from "./experience-loading-status";
import { AudioScene } from "./scenes/audio-scene";
import { ComputingScene } from "./scenes/computing-scene";
import { FeaturedScene } from "./scenes/featured-scene";
import { GamingScene } from "./scenes/gaming-scene";
import { IntroScene } from "./scenes/intro-scene";
import { SmartphoneScene } from "./scenes/smartphone-scene";
import { ShowroomEnvironment } from "./showroom-environment";

export function ExperienceCanvas({
  progress,
  preloadStage,
  preferences,
  onFatalError,
}: {
  readonly progress: MutableRefObject<number>;
  readonly preloadStage: HomepagePreloadStage;
  readonly preferences: HomepagePreferences;
  readonly onFatalError: () => void;
}) {
  const visible = useDocumentVisibility();
  const introStatus = useHomepagePreload(preloadStage);
  return (
    <div
      className="homepage-experience-canvas"
      data-testid="homepage-canvas-layer"
      data-showroom-theme={preferences.theme}
      aria-hidden="true"
    >
      {introStatus === "loading" ? <ExperienceLoadingStatus progress={0} /> : null}
      <ExperienceErrorBoundary onFatalError={onFatalError}>
        <Canvas
          camera={{ position: [0, 0, 7], fov: 42 }}
          dpr={preferences.budget.dpr}
          shadows={preferences.budget.shadows}
          frameloop={
            visible ? (preferences.budget.idleMotion ? "always" : "demand") : "never"
          }
          gl={{
            antialias: preferences.tier !== "low",
            powerPreference: "high-performance",
          }}
        >
          <ShowroomEnvironment
            theme={preferences.theme}
            budget={preferences.budget}
          />
          <IntroScene
            progress={progress}
            theme={preferences.theme}
            budget={preferences.budget}
          />
          {preloadStage >= 1 ? (
            <>
              <SmartphoneScene
                progress={progress}
                theme={preferences.theme}
                budget={preferences.budget}
              />
              <ComputingScene
                progress={progress}
                theme={preferences.theme}
                budget={preferences.budget}
              />
            </>
          ) : null}
          {preloadStage >= 2 ? (
            <>
              <AudioScene
                progress={progress}
                theme={preferences.theme}
                budget={preferences.budget}
              />
              <GamingScene
                progress={progress}
                theme={preferences.theme}
                budget={preferences.budget}
              />
              <FeaturedScene
                progress={progress}
                theme={preferences.theme}
                budget={preferences.budget}
              />
            </>
          ) : null}
        </Canvas>
      </ExperienceErrorBoundary>
    </div>
  );
}
