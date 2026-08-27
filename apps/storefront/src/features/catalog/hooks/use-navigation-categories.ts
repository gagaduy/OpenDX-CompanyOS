// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { StorefrontCategory } from "../types/catalog.types";

export interface NavigationCategoryReader {
  readonly categories: () => Promise<readonly StorefrontCategory[]>;
}

export function useNavigationCategories(api: NavigationCategoryReader) {
  const [categories, setCategories] = useState<readonly StorefrontCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.categories().then(
      (result) => {
        if (!active) return;
        setCategories(result);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setCategories([]);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  return { categories, loading } as const;
}
