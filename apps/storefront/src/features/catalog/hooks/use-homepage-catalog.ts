// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { HomepageSceneId } from "../types/homepage-experience.types";
import type {
  ProductPage,
  StorefrontProduct,
} from "../types/catalog.types";

export interface HomepageCatalogReader {
  readonly products: (parameters: URLSearchParams) => Promise<ProductPage>;
}

export interface HomepageCatalogState {
  readonly loading: boolean;
  readonly error?: string;
  readonly sceneProducts: Readonly<
    Partial<Record<HomepageSceneId, StorefrontProduct>>
  >;
  readonly featuredProducts: readonly StorefrontProduct[];
  readonly retry: () => Promise<void>;
}

const sceneQueries = [
  "category=phones&sort=best_selling&page=1&pageSize=1",
  "category=laptops&sort=best_selling&page=1&pageSize=1",
  "query=headphones&sort=best_selling&page=1&pageSize=1",
  "query=controller&sort=best_selling&page=1&pageSize=1",
  "sort=best_selling&page=1&pageSize=4",
] as const;

export function useHomepageCatalog(
  api: HomepageCatalogReader,
): HomepageCatalogState {
  const [state, setState] = useState<
    Omit<HomepageCatalogState, "retry">
  >({
    loading: true,
    sceneProducts: {},
    featuredProducts: [],
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const [phones, laptops, audio, gaming, featured] = await Promise.all(
        sceneQueries.map((query) => api.products(new URLSearchParams(query))),
      );
      setState({
        loading: false,
        sceneProducts: {
          smartphones: phones?.items[0],
          computing: laptops?.items[0],
          audio: audio?.items[0],
          gaming: gaming?.items[0],
        },
        featuredProducts: featured?.items ?? [],
      });
    } catch {
      setState({
        loading: false,
        error: "Không thể tải sản phẩm nổi bật.",
        sceneProducts: {},
        featuredProducts: [],
      });
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, retry: load };
}
