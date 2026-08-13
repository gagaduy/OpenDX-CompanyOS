// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, CircleDollarSign, MapPin } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DialogShell } from "../../../shared/components/dialog-shell";
import { formatVnd } from "../../../shared/format/currency";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { OrderApiError, type OrderOperationsApi } from "../api/order-operations-api";
import { OrderHistory } from "../components/order-history";
import { OrderStatusBadge } from "../components/order-status-badge";
import { useOrder } from "../hooks/use-orders";
import type { OrderDetailView, OrderTransitionInput } from "../types/order.types";

type OrderAction = Omit<OrderTransitionInput, "version"> & { readonly label: string };

const actions: Partial<Record<OrderDetailView["status"], OrderAction>> = {
  pending_payment: { targetStatus: "canceled", reasonCode: "STAFF_UNPAID_ORDER_CANCELED", label: "Cancel unpaid order" },
  paid: { targetStatus: "processing", reasonCode: "STAFF_PROCESSING_STARTED", label: "Start processing" },
  processing: { targetStatus: "ready_for_fulfillment", reasonCode: "STAFF_PROCESSING_FINISHED", label: "Mark ready for completion" },
  ready_for_fulfillment: { targetStatus: "completed", reasonCode: "STAFF_ORDER_COMPLETED", label: "Complete order" },
};
export function OrderDetailPage({ api, roles }: { readonly api: OrderOperationsApi; readonly roles: readonly StaffRole[] }) {
  const { orderId } = useParams(); const orderState = useOrder(api, orderId); const [saving, setSaving] = useState(false); const [confirmCancellation, setConfirmCancellation] = useState(false); const [mutationError, setMutationError] = useState<string>(); const [notice, setNotice] = useState<string>();
  const canWrite = roles.some((role) => role === "administrator" || role === "operations_manager"); const action = orderState.data ? actions[orderState.data.status] : undefined;
  const transition = async () => { if (!orderState.data || !action) return; setSaving(true); setMutationError(undefined); setNotice(undefined); try { const updated = await api.transition(orderState.data.id, { targetStatus: action.targetStatus, reasonCode: action.reasonCode, version: orderState.data.version }); orderState.replace(updated); setConfirmCancellation(false); setNotice(`Order moved to ${updated.statusLabel}.`); } catch (reason) { setMutationError(reason instanceof OrderApiError ? reason.message : "Order status could not be changed."); } finally { setSaving(false); } };
  if (orderState.loading && !orderState.data) return <div className="pageState" role="status">Loading order…</div>;
  if (orderState.error || !orderState.data) return <div className="pageState" role="alert"><p>{orderState.error ?? "Order detail could not be loaded."}</p><button className="secondaryButton" onClick={orderState.reload}>Retry</button></div>;
  const order = orderState.data;
  return <section className="catalogWorkspace operationDetail"><Link className="backLink" to="/orders"><ArrowLeft size={15} /> Orders</Link><header className="operationDetailHeader"><div><p className="sectionKicker">Order · {new Date(order.createdAt).toLocaleString("en-GB")}</p><h1>{order.publicNumber}</h1><span>{order.customerEmail}</span></div><div><OrderStatusBadge status={order.status} />{canWrite && action && <button className={action.targetStatus === "canceled" ? "dangerButton" : "primaryButton"} disabled={saving} onClick={() => action.targetStatus === "canceled" ? setConfirmCancellation(true) : void transition()}>{saving ? "Saving…" : action.label}</button>}</div></header>{notice && <p className="notice" role="status">{notice}</p>}{mutationError && <div className="notice errorNotice" role="alert"><span>{mutationError}</span>{mutationError.includes("Refresh") && <button className="secondaryButton" onClick={orderState.reload}>Refresh order</button>}</div>}<div className="operationDetailGrid"><div className="operationMain"><section className="operationPanel"><h2>Order lines</h2>{order.lines.map((line) => <div className="operationLine" key={line.id}><div><strong>{line.productTitle}</strong><span>{line.variantLabel} · {line.sku}</span><small>{line.quantity} × {formatVnd(line.unitPriceVnd)}{line.discountAllocationVnd > 0 ? ` · ${formatVnd(line.discountAllocationVnd)} discount` : ""}</small></div><strong>{formatVnd(line.lineTotalVnd)}</strong></div>)}</section><section className="operationPanel" aria-label="Order status history"><h2>Status history</h2><OrderHistory history={order.history} /></section></div><aside className="operationSide" aria-label="Order snapshot"><section className="operationPanel"><h2><CircleDollarSign size={17} /> Financial snapshot</h2><dl className="metricList"><div><dt>Subtotal</dt><dd>{formatVnd(order.subtotalVnd)}</dd></div><div><dt>Discount</dt><dd>-{formatVnd(order.discountVnd)}</dd></div><div className="metricTotal"><dt>Total</dt><dd>{formatVnd(order.totalVnd)}</dd></div></dl></section><section className="operationPanel"><h2><MapPin size={17} /> Customer snapshot</h2><address><strong>{order.addressSnapshot.recipientName}</strong><span>{order.addressSnapshot.phoneNumber}</span><span>{order.addressSnapshot.addressLine}</span><span>{order.addressSnapshot.ward}, {order.addressSnapshot.provinceOrCity}</span></address></section></aside></div><DialogShell open={confirmCancellation} title="Cancel unpaid order?" onClose={() => setConfirmCancellation(false)}><p>This records an immutable staff cancellation event. The order cannot be restored from this screen.</p><div className="dialogActions"><button className="secondaryButton" type="button" onClick={() => setConfirmCancellation(false)}>Keep order</button><button className="dangerButton" type="button" disabled={saving} onClick={() => void transition()}>{saving ? "Canceling…" : "Confirm cancellation"}</button></div></DialogShell></section>;
}
