// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { Object3D } from "three";
import {
  HomepageModelLoadError,
  preloadHomepageModel,
} from "../lib/homepage-model-loader";
import type { HomepageModelAsset } from "../types/homepage-experience.types";

export type HomepageModelState =
  | { readonly status: "loading"; readonly scene?: undefined; readonly error?: undefined }
  | { readonly status: "ready"; readonly scene: Object3D; readonly error?: undefined }
  | {
      readonly status: "error";
      readonly scene?: undefined;
      readonly error: HomepageModelLoadError;
    };

export function useHomepageModel(
  asset: HomepageModelAsset,
  timeoutMs = 10_000,
): HomepageModelState {
  const [state, setState] = useState<HomepageModelState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void preloadHomepageModel(asset, { timeoutMs }).then(
      (template) => {
        if (active) setState({ status: "ready", scene: template.clone(true) });
      },
      (error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          error:
            error instanceof HomepageModelLoadError
              ? error
              : new HomepageModelLoadError(
                  "MODEL_PARSE_ERROR",
                  "Model could not be loaded",
                ),
        });
      },
    );
    return () => {
      active = false;
    };
  }, [asset, timeoutMs]);

  return state;
}
