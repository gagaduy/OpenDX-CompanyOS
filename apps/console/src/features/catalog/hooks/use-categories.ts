// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { CatalogApi } from "../api/catalog-api";
import type { Category } from "../types/catalog.types";

export function useCategories(api: CatalogApi) {
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setCategories(await api.listCategories()); } catch { setError(true); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  return { categories, loading, error, reload: load };
}
