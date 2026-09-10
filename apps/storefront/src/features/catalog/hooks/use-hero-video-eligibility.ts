// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

const desktopQuery = "(min-width: 768px)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

interface HeroVideoQueries {
  readonly desktop: MediaQueryList;
  readonly reducedMotion: MediaQueryList;
}

function createQueries(): HeroVideoQueries | undefined {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return undefined;
  }
  return {
    desktop: window.matchMedia(desktopQuery),
    reducedMotion: window.matchMedia(reducedMotionQuery),
  };
}

function isEligible(queries: HeroVideoQueries | undefined): boolean {
  return (
    queries !== undefined &&
    queries.desktop.matches &&
    !queries.reducedMotion.matches
  );
}

export function useHeroVideoEligibility(): boolean {
  const [queries] = useState(createQueries);
  const [eligible, setEligible] = useState(() => isEligible(queries));

  useEffect(() => {
    if (queries === undefined) return;
    const update = () => setEligible(isEligible(queries));
    queries.desktop.addEventListener("change", update);
    queries.reducedMotion.addEventListener("change", update);
    return () => {
      queries.desktop.removeEventListener("change", update);
      queries.reducedMotion.removeEventListener("change", update);
    };
  }, [queries]);

  return eligible;
}
