// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProductPage,
  StorefrontCategory,
  StorefrontHeroSlide,
  StorefrontProduct,
} from "../types/catalog.types";

export interface HomepageCatalogReader {
  readonly categories: () => Promise<readonly StorefrontCategory[]>;
  readonly heroSlides: () => Promise<readonly StorefrontHeroSlide[]>;
  readonly products: (parameters: URLSearchParams) => Promise<ProductPage>;
}

export interface HomepageRegion<T> {
  readonly status: "loading" | "ready" | "empty" | "error";
  readonly data: T;
  readonly retry: () => Promise<void>;
}

export interface CategoryPromotion {
  readonly category: StorefrontCategory;
  readonly product: StorefrontProduct;
}

export type HomepageRailId = "featured" | "bestSelling" | "newest";

export interface HomepageCatalogState {
  readonly categories: HomepageRegion<readonly StorefrontCategory[]>;
  readonly hero: HomepageRegion<readonly StorefrontHeroSlide[]>;
  readonly promotions: HomepageRegion<readonly CategoryPromotion[]>;
  readonly rails: Readonly<
    Record<HomepageRailId, HomepageRegion<readonly StorefrontProduct[]>>
  >;
}

export const homepageQueries: Readonly<Record<HomepageRailId, string>> = {
  featured: "discountStatus=on_sale&sort=newest&page=1&pageSize=8",
  bestSelling: "sort=best_selling&page=1&pageSize=8",
  newest: "sort=newest&page=1&pageSize=8",
};

type RegionSnapshot<T> = Omit<HomepageRegion<T>, "retry">;

const loadingList = <T,>(): RegionSnapshot<readonly T[]> => ({
  status: "loading",
  data: [],
});

function settledList<T>(data: readonly T[]): RegionSnapshot<readonly T[]> {
  return { status: data.length === 0 ? "empty" : "ready", data };
}

export function useHomepageCatalog(api: HomepageCatalogReader): HomepageCatalogState {
  const mounted = useRef(false);
  const [categories, setCategories] = useState<RegionSnapshot<readonly StorefrontCategory[]>>(
    loadingList,
  );
  const [hero, setHero] = useState<RegionSnapshot<readonly StorefrontHeroSlide[]>>(
    loadingList,
  );
  const [promotions, setPromotions] = useState<RegionSnapshot<readonly CategoryPromotion[]>>(
    loadingList,
  );
  const [rails, setRails] = useState<
    Readonly<Record<HomepageRailId, RegionSnapshot<readonly StorefrontProduct[]>>>
  >({
    featured: loadingList(),
    bestSelling: loadingList(),
    newest: loadingList(),
  });

  const loadCategories = useCallback(async () => {
    if (mounted.current) {
      setCategories(loadingList());
      setPromotions(loadingList());
    }
    try {
      const result = await api.categories();
      if (!mounted.current) return;
      setCategories(settledList(result));
      if (result.length === 0) {
        setPromotions(settledList([]));
        return;
      }

      const promotionResults = await Promise.allSettled(
        result.slice(0, 4).map(async (category) => {
          const page = await api.products(
            new URLSearchParams(
              `category=${encodeURIComponent(category.slug)}&sort=best_selling&page=1&pageSize=1`,
            ),
          );
          const product = page.items[0];
          return product === undefined ? undefined : { category, product };
        }),
      );
      if (!mounted.current) return;
      const available = promotionResults.flatMap((result) =>
        result.status === "fulfilled" && result.value !== undefined ? [result.value] : [],
      );
      const everyRequestFailed = promotionResults.every((result) => result.status === "rejected");
      setPromotions(
        everyRequestFailed ? { status: "error", data: [] } : settledList(available),
      );
    } catch {
      if (!mounted.current) return;
      setCategories({ status: "error", data: [] });
      setPromotions({ status: "error", data: [] });
    }
  }, [api]);

  const loadHero = useCallback(async () => {
    if (mounted.current) setHero(loadingList());
    try {
      const result = await api.heroSlides();
      if (mounted.current) setHero(settledList(result));
    } catch {
      if (mounted.current) setHero({ status: "error", data: [] });
    }
  }, [api]);

  const loadRail = useCallback(
    async (rail: HomepageRailId) => {
      if (mounted.current) {
        setRails((current) => ({ ...current, [rail]: loadingList() }));
      }
      try {
        const result = await api.products(new URLSearchParams(homepageQueries[rail]));
        if (mounted.current) {
          setRails((current) => ({ ...current, [rail]: settledList(result.items) }));
        }
      } catch {
        if (mounted.current) {
          setRails((current) => ({ ...current, [rail]: { status: "error", data: [] } }));
        }
      }
    },
    [api],
  );

  useEffect(() => {
    mounted.current = true;
    void loadCategories();
    void loadHero();
    void loadRail("featured");
    void loadRail("bestSelling");
    void loadRail("newest");
    return () => {
      mounted.current = false;
    };
  }, [loadCategories, loadHero, loadRail]);

  return {
    categories: { ...categories, retry: loadCategories },
    hero: { ...hero, retry: loadHero },
    promotions: { ...promotions, retry: loadCategories },
    rails: {
      featured: { ...rails.featured, retry: () => loadRail("featured") },
      bestSelling: { ...rails.bestSelling, retry: () => loadRail("bestSelling") },
      newest: { ...rails.newest, retry: () => loadRail("newest") },
    },
  };
}
