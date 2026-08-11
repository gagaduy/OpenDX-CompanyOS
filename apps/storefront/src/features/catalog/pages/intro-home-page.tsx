// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useRef } from "react";
import { ExperienceSceneNavigation } from "../components/homepage-experience/experience-scene-navigation";
import { StaticHomepageExperience } from "../components/homepage-experience/static-homepage-experience";
import {
  useHomepageCatalog,
  type HomepageCatalogReader,
} from "../hooks/use-homepage-catalog";
import { useHomepageScroll } from "../hooks/use-homepage-scroll";

export function IntroHomePage({
  api,
  apiBaseUrl,
}: {
  readonly api: HomepageCatalogReader;
  readonly apiBaseUrl: string;
}) {
  const catalog = useHomepageCatalog(api);
  const journeyRef = useRef<HTMLDivElement>(null);
  const scroll = useHomepageScroll(journeyRef);
  return (
    <main id="main-content" className="intro-home-page">
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
