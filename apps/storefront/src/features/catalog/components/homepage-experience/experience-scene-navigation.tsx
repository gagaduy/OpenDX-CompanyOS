// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  HOMEPAGE_SCENE_IDS,
  type HomepageSceneId,
} from "../../types/homepage-experience.types";

const sceneLabels: Readonly<Record<HomepageSceneId, string>> = {
  intro: "Mở đầu",
  smartphones: "Điện thoại",
  computing: "Máy tính",
  audio: "Âm thanh",
  gaming: "Gaming",
  featured: "Nổi bật",
};

export function ExperienceSceneNavigation({
  activeScene,
  onSelect,
}: {
  readonly activeScene: HomepageSceneId;
  readonly onSelect: (scene: HomepageSceneId) => void;
}) {
  return (
    <nav
      className="homepage-scene-navigation"
      aria-label="Điều hướng showroom"
    >
      {HOMEPAGE_SCENE_IDS.map((scene) => (
        <button
          key={scene}
          type="button"
          aria-current={activeScene === scene ? "location" : undefined}
          onClick={() => onSelect(scene)}
        >
          <span aria-hidden="true" className="homepage-scene-navigation-dot" />
          <span>{sceneLabels[scene]}</span>
        </button>
      ))}
    </nav>
  );
}
