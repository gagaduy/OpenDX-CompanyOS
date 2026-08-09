// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { OrderSummaryView } from "../types/order.types";
import { OrderStatusBadge } from "./order-status-badge";

export function OrderTable({ orders }: { readonly orders: readonly OrderSummaryView[] }) {
  return <div className="tableFrame"><table className="operationsTable"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Updated</th><th><span className="srOnly">Open</span></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td data-label="Order"><strong>{order.publicNumber}</strong><small>{new Date(order.createdAt).toLocaleString("en-GB")}</small></td><td data-label="Customer"><span>{order.customerEmail}</span><small>{order.customerId}</small></td><td data-label="Status"><OrderStatusBadge status={order.status} /></td><td data-label="Total"><strong>{formatVnd(order.totalVnd)}</strong></td><td data-label="Updated">{new Date(order.updatedAt).toLocaleString("en-GB")}</td><td data-label="Open"><Link className="iconButton" aria-label={`Open ${order.publicNumber}`} to={`/orders/${order.id}`}><ArrowRight size={16} /></Link></td></tr>)}</tbody></table></div>;
}
