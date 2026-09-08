// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { OrderApi } from "../api/order-api";
import type { OrderDetail, OrderList } from "../types/order.types";
import { useOptionalCustomerSessionState } from "../../authentication";

export function useOrders(api: OrderApi) {
  const { session, sessionLoading } = useOptionalCustomerSessionState();
  const customerId = session?.kind === "customer" ? session.customerId : undefined;
  const [orders, setOrders] = useState<OrderList>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (sessionLoading) return;
    if (session && session.kind !== "customer") {
      setOrders(undefined);
      return;
    }
    let active = true;
    api.list().then((result) => {
      if (active) setOrders(result);
    }).catch(() => {
      if (active) setError("Không thể tải danh sách đơn hàng.");
    });
    return () => { active = false; };
  }, [api, session, sessionLoading, customerId]);
  return { orders, error };
}

export function useOrder(api: OrderApi, orderId: string | undefined) {
  const [order, setOrder] = useState<OrderDetail>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (orderId === undefined) return;
    let active = true;
    api.get(orderId).then((result) => {
      if (active) setOrder(result);
    }).catch(() => {
      if (active) setError("Không thể tải đơn hàng này.");
    });
    return () => { active = false; };
  }, [api, orderId]);
  return { order, error };
}
