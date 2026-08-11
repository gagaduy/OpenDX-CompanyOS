// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import type { StorefrontHeroSlide } from "../types/catalog.types";

interface HeroSlidesState {
  readonly loading: boolean;
  readonly slides: readonly StorefrontHeroSlide[];
  readonly error?: string;
}

export function useHeroSlides(
  api: StorefrontCatalogApi,
  enabled: boolean,
): HeroSlidesState {
  const [state, setState] = useState<HeroSlidesState>({
    loading: enabled,
    slides: [],
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, slides: [] });
      return;
    }
    let cancelled = false;
    setState({ loading: true, slides: [] });
    void api.heroSlides().then(
      (slides) => {
        if (!cancelled) setState({ loading: false, slides });
      },
      () => {
        if (!cancelled) {
          setState({
            loading: false,
            slides: [],
            error: "Không thể tải trình chiếu danh mục.",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, enabled]);

  return state;
}
