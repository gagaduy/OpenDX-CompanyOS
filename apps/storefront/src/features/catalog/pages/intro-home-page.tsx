// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { lazy, Suspense, useRef, useState } from "react";
import { ExperienceSceneNavigation } from "../components/homepage-experience/experience-scene-navigation";
import { StaticHomepageExperience } from "../components/homepage-experience/static-homepage-experience";
import {
  useHomepageCatalog,
  type HomepageCatalogReader,
} from "../hooks/use-homepage-catalog";
import { useHomepageScroll } from "../hooks/use-homepage-scroll";
import { useHomepagePreferences } from "../hooks/use-homepage-preferences";

const ExperienceCanvas = lazy(async () => {
  const module = await import(
    "../components/homepage-experience/experience-canvas"
  );
  return { default: module.ExperienceCanvas };
});

export function IntroHomePage({
  api,
  apiBaseUrl,
}: {
  readonly api: HomepageCatalogReader;
  readonly apiBaseUrl: string;
}) {
  const catalog = useHomepageCatalog(api);
  const journeyRef = useRef<HTMLDivElement>(null);
  const preferences = useHomepagePreferences();
  const scroll = useHomepageScroll(journeyRef, {
    reducedMotion: preferences.reducedMotion,
  });
  const [canvasFailed, setCanvasFailed] = useState(false);
  const useStaticExperience = preferences.tier === "static" || canvasFailed;
  return (
    <main
      id="main-content"
      className="intro-home-page"
      data-experience-mode={useStaticExperience ? "static" : "3d"}
    >
      {useStaticExperience ? null : (
        <Suspense fallback={null}>
          <ExperienceCanvas
            progress={scroll.progress}
            preferences={preferences}
            onFatalError={() => setCanvasFailed(true)}
          />
        </Suspense>
      )}
      <ExperienceSceneNavigation
        activeScene={scroll.activeScene}
        onSelect={scroll.selectScene}
      />
      <div ref={journeyRef} className="homepage-experience-journey">
        <StaticHomepageExperience catalog={catalog} apiBaseUrl={apiBaseUrl} />
      </div>
    </main>
  );
}
