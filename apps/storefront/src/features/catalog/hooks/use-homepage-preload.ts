// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { homepageModelAssets } from "../data/homepage-model-assets";
import {
  clearHomepageModelCache,
  preloadHomepageModel,
} from "../lib/homepage-model-loader";
import type {
  HomepageModelId,
  HomepagePreloadStage,
} from "../types/homepage-experience.types";

export type HomepageIntroLoadStatus = "loading" | "ready" | "error";

const assetsById = new Map(
  homepageModelAssets.map((asset) => [asset.id, asset] as const),
);

export function useHomepagePreload(
  stage: HomepagePreloadStage,
): HomepageIntroLoadStatus {
  const requested = useRef(
    new Map<HomepageModelId, ReturnType<typeof preloadHomepageModel>>(),
  );
  const [introStatus, setIntroStatus] = useState<HomepageIntroLoadStatus>(
    "loading",
  );

  useEffect(() => {
    let active = true;
    const request = (id: HomepageModelId) => {
      const existing = requested.current.get(id);
      if (existing !== undefined) return existing;
      const asset = assetsById.get(id);
      if (asset === undefined) return;
      const load = preloadHomepageModel(asset);
      requested.current.set(id, load);
      return load;
    };

    void request("laptop")?.then(
      () => active && setIntroStatus("ready"),
      () => active && setIntroStatus("error"),
    );
    if (stage >= 1) request("smartphone");
    if (stage >= 2) {
      request("headphones");
      request("game-controller");
    }
    return () => {
      active = false;
    };
  }, [stage]);

  useEffect(
    () => () => {
      void clearHomepageModelCache({ dispose: true });
    },
    [],
  );

  return introStatus;
}
