// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, Check } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { OrderApi } from "../api/order-api";
import { OrderStatus, orderStatusLabel } from "../components/order-status";
import { useOrder } from "../hooks/use-orders";

export function OrderDetailPage({ api }: { readonly api: OrderApi }) {
  const { orderId } = useParams();
  const { order, error } = useOrder(api, orderId);
  if (error) return <main id="main-content" className="content-page"><p role="alert" className="state-panel">{error}</p></main>;
  if (order === undefined) return <main id="main-content" className="content-page"><p role="status" className="state-panel">Đang tải đơn hàng...</p></main>;
  return (
    <main id="main-content" className="content-page order-detail-page">
      <Link className="back-link" to="/orders"><ArrowLeft aria-hidden="true" /> Tất cả đơn hàng</Link>
      <div className="page-heading"><div><span className="eyebrow">{new Date(order.createdAt).toLocaleDateString("vi-VN")}</span><h1>{order.publicNumber}</h1></div><OrderStatus status={order.status} /></div>
      <div className="order-detail-layout">
        <section>
          <div className="order-detail-section"><h2>Sản phẩm</h2>{order.lines.map((line) => <div className="review-line" key={line.id}><div><strong>{line.productTitle}</strong><span>{line.variantLabel} · {line.sku} · {line.quantity} × {formatVnd(line.unitPriceVnd)}</span></div><div className="order-line-total"><strong>{formatVnd(line.lineTotalVnd)}</strong>{line.discountAllocationVnd > 0 && <span>Đã giảm {formatVnd(line.discountAllocationVnd)}</span>}</div></div>)}</div>
          <div className="order-detail-section"><h2>Tiến trình đơn hàng</h2><ol className="order-timeline">{order.history.map((entry, index) => <li key={`${entry.occurredAt}-${index}`}><Check aria-hidden="true" /><div><strong>{orderStatusLabel(entry.newStatus)}</strong><small>{new Date(entry.occurredAt).toLocaleString("vi-VN")}</small></div></li>)}</ol></div>
        </section>
        <aside className="checkout-summary order-total-summary"><h2>Tổng đơn hàng</h2><dl><div><dt>Tạm tính</dt><dd>{formatVnd(order.subtotalVnd)}</dd></div><div><dt>Ưu đãi</dt><dd>-{formatVnd(order.discountVnd)}</dd></div><div className="checkout-total"><dt>Tổng cộng</dt><dd>{formatVnd(order.totalVnd)}</dd></div></dl><p>Thuế đã bao gồm, không tách riêng.</p></aside>
      </div>
    </main>
  );
}
