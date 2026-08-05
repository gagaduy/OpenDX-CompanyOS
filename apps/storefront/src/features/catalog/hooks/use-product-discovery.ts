// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import type { ProductPage, StorefrontCategory } from "../types/catalog.types";

export function useProductDiscovery(api: StorefrontCatalogApi, parameters: URLSearchParams) {
  const [state, setState] = useState<{ loading: boolean; page?: ProductPage; categories: readonly StorefrontCategory[]; error?: string }>({ loading: true, categories: [] });
  const key = parameters.toString();
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const [page, categories] = await Promise.all([api.products(new URLSearchParams(key)), api.categories()]);
      setState({ loading: false, page, categories });
    } catch { setState((current) => ({ ...current, loading: false, error: "Không thể tải sản phẩm. Vui lòng thử lại." })); }
  }, [api, key]);
  useEffect(() => { void load(); }, [load]);
  return { ...state, retry: load };
}
