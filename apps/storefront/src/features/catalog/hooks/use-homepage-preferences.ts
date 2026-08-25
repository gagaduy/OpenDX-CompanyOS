// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { useTheme } from "../../../app/theme-provider";
import {
  budgetForTier,
  selectExperienceTier,
  type ExperienceBudget,
  type ExperienceTier,
} from "../lib/homepage-quality";

export interface HomepagePreferences {
  readonly theme: "dark" | "light";
  readonly reducedMotion: boolean;
  readonly tier: ExperienceTier;
  readonly budget: ExperienceBudget;
}

interface NavigatorWithMemory extends Navigator {
  readonly deviceMemory?: number;
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return (
      canvas.getContext("webgl2") !== null ||
      canvas.getContext("webgl") !== null
    );
  } catch {
    return false;
  }
}

function readSignals(reducedMotion: boolean) {
  const navigatorWithMemory = navigator as NavigatorWithMemory;
  return {
    webgl: supportsWebGL(),
    reducedMotion,
    width: window.innerWidth,
    memoryGb: navigatorWithMemory.deviceMemory,
    cores: navigator.hardwareConcurrency,
  };
}

function reducedMotionQuery(): MediaQueryList {
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  };
}

export function useHomepagePreferences(): HomepagePreferences {
  const { resolvedTheme } = useTheme();
  const [media] = useState(reducedMotionQuery);
  const [signals, setSignals] = useState(() => readSignals(media.matches));

  useEffect(() => {
    const update = () => setSignals(readSignals(media.matches));
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [media]);

  const tier = selectExperienceTier(signals);
  return {
    theme: resolvedTheme,
    reducedMotion: signals.reducedMotion,
    tier,
    budget: budgetForTier(tier),
  };
}
