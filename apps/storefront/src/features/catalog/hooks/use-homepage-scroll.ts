// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { clampProgress, sceneAtProgress } from "../lib/homepage-scene-progress";
import type {
  HomepagePreloadStage,
  HomepageSceneId,
} from "../types/homepage-experience.types";

export interface HomepageScrollDirector {
  readonly progress: React.MutableRefObject<number>;
  readonly activeScene: HomepageSceneId;
  readonly preloadStage: HomepagePreloadStage;
  readonly selectScene: (scene: HomepageSceneId) => void;
}

export function useHomepageScroll(
  containerRef: RefObject<HTMLElement | null>,
  { reducedMotion = false }: { readonly reducedMotion?: boolean } = {},
): HomepageScrollDirector {
  const progress = useRef(0);
  const scheduledFrame = useRef<number | undefined>(undefined);
  const [activeScene, setActiveScene] = useState<HomepageSceneId>("intro");
  const [preloadStage, setPreloadStage] = useState<HomepagePreloadStage>(0);

  const updateProgress = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    const documentTop = window.scrollY + container.getBoundingClientRect().top;
    const scrollRange = Math.max(1, container.scrollHeight - window.innerHeight);
    const nextProgress = clampProgress(
      (window.scrollY - documentTop) / scrollRange,
    );
    progress.current = nextProgress;
    const nextScene = sceneAtProgress(nextProgress);
    const nextPreloadStage: HomepagePreloadStage =
      nextProgress >= 0.4 ? 2 : nextProgress >= 0.08 ? 1 : 0;
    setActiveScene((current) =>
      current === nextScene ? current : nextScene,
    );
    setPreloadStage((current) =>
      current === nextPreloadStage ? current : nextPreloadStage,
    );
  }, [containerRef]);

  const scheduleUpdate = useCallback(() => {
    if (scheduledFrame.current !== undefined) return;
    scheduledFrame.current = window.requestAnimationFrame(() => {
      scheduledFrame.current = undefined;
      updateProgress();
    });
  }, [updateProgress]);

  useEffect(() => {
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (scheduledFrame.current !== undefined) {
        window.cancelAnimationFrame(scheduledFrame.current);
        scheduledFrame.current = undefined;
      }
    };
  }, [scheduleUpdate]);

  const selectScene = useCallback(
    (scene: HomepageSceneId) => {
      document.getElementById(`homepage-${scene}`)?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    },
    [reducedMotion],
  );

  return { progress, activeScene, preloadStage, selectScene };
}
