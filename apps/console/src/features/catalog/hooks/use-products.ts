// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { CatalogApi } from "../api/catalog-api";
import type { ProductPage, ProductQuery } from "../types/catalog.types";

export function useProducts(api: CatalogApi, query: ProductQuery) {
  const [data, setData] = useState<ProductPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    api.listProducts(query).then((value) => { if (active) setData(value); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, query.categoryId, query.page, query.pageSize, query.query, query.status, revision]);
  return { data, loading, error, reload };
}
