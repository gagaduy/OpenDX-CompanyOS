// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { InventoryApi } from "../api/inventory-api";
import type { InventoryItemView, InventoryPageView, InventoryQuery } from "../types/inventory.types";

export function useInventory(api: InventoryApi, query: InventoryQuery) {
  const [data, setData] = useState<InventoryPageView<InventoryItemView>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    api.listItems(query, controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, query.categoryId, query.page, query.pageSize, query.query, query.stockStatus, revision]);
  return { data, loading, error, reload };
}
