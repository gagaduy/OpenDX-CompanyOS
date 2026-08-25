// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import type { HomepageSceneId } from "../../types/homepage-experience.types";

export function HomepageSceneSection({
  scene,
  eyebrow,
  heading,
  copy,
  children,
}: {
  readonly scene: HomepageSceneId;
  readonly eyebrow: string;
  readonly heading: string;
  readonly copy: string;
  readonly children?: ReactNode;
}) {
  const headingId = `homepage-${scene}-title`;
  const Heading = scene === "intro" ? "h1" : "h2";
  return (
    <section
      id={`homepage-${scene}`}
      className={`homepage-scene homepage-scene-${scene}`}
      data-testid="homepage-scene"
      data-scene={scene}
      aria-labelledby={headingId}
    >
      <div className="homepage-scene-content">
        <span className="eyebrow">{eyebrow}</span>
        <Heading id={headingId}>{heading}</Heading>
        <p>{copy}</p>
        {children}
      </div>
    </section>
  );
}
