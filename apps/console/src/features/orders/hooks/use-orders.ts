// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { OrderOperationsApi } from "../api/order-operations-api";
import type { OrderDetailView, OrderPageView, OrderQuery } from "../types/order.types";

export function useOrders(api: OrderOperationsApi, query: OrderQuery) {
  const [data, setData] = useState<OrderPageView>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(undefined);

    api
      .list(query, controller.signal)
      .then((orders) => {
        if (active) setData(orders);
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError("Orders could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [api, query, version]);

  return { data, error, loading, reload };
}

export function useOrder(api: OrderOperationsApi, orderId: string | undefined) {
  const [data, setData] = useState<OrderDetailView>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (!orderId) {
      setError("Order identifier is missing.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(undefined);

    api
      .get(orderId, controller.signal)
      .then((order) => {
        if (active) setData(order);
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError("Order detail could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [api, orderId, version]);

  return { data, error, loading, reload, replace: setData };
}
