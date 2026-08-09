// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { OrderApi } from "../api/order-api";
import { OrderStatus } from "../components/order-status";
import { useOrders } from "../hooks/use-orders";

export function OrderListPage({ api }: { readonly api: OrderApi }) {
  const { orders, error } = useOrders(api);
  return (
    <main id="main-content" className="content-page order-page">
      <div className="page-heading"><div><span className="eyebrow">Tài khoản khách hàng</span><h1>Đơn hàng</h1></div><p>Lịch sử mua sắm của bạn</p></div>
      {error && <p role="alert" className="inline-alert">{error}</p>}
      {orders === undefined && !error ? <p role="status" className="state-panel">Đang tải đơn hàng...</p> : orders?.items.length === 0 ? (
        <div className="state-panel"><PackageOpen aria-hidden="true" /><p>Bạn chưa có đơn hàng nào.</p><Link className="button primary" to="/">Khám phá sản phẩm</Link></div>
      ) : (
        <div className="order-list">
          {orders?.items.map((order) => (
            <Link className="order-row" to={`/orders/${order.id}`} key={order.id}>
              <div><small>{new Date(order.createdAt).toLocaleDateString("vi-VN")}</small><strong>{order.publicNumber}</strong></div>
              <OrderStatus status={order.status} />
              <strong>{formatVnd(order.totalVnd)}</strong>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
