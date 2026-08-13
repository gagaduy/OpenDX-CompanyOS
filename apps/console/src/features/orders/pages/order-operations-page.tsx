// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { OrderOperationsApi } from "../api/order-operations-api";
import { OrderTable } from "../components/order-table";
import { useOrders } from "../hooks/use-orders";
import type { OrderStatus } from "../types/order.types";

const statuses: readonly OrderStatus[] = ["pending_payment", "paid", "processing", "ready_for_fulfillment", "completed", "canceled", "expired"];
export function OrderOperationsPage({ api }: { readonly api: OrderOperationsApi }) {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => ({ status: status(params.get("status")), page: page(params.get("page")), pageSize: 20 }), [params]);
  const { data, error, loading, reload } = useOrders(api, query);
  const update = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; });
  return <section className="catalogWorkspace operationsWorkspace"><PageHeader eyebrow="Commerce operations" title="Orders" description={`${data?.totalItems ?? 0} immutable customer orders`} /><div className="filterBar"><label><span>Status</span><select aria-label="Order status" value={query.status ?? ""} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div>{loading && !data ? <SystemState kind="loading" title="Loading orders…" /> : error ? <SystemState kind="error" title="Orders could not be loaded" description={error} action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} /> : data?.items.length === 0 ? <SystemState kind="empty" title="No orders match this view." /> : data ? <><OrderTable orders={data.items} /><div className="pagination"><span>{loading ? "Refreshing…" : `Page ${data.page} of ${Math.max(data.totalPages, 1)}`}</span><button className="secondaryButton" disabled={data.page <= 1} onClick={() => update("page", String(data.page - 1))}>Previous page</button><button className="secondaryButton" disabled={data.page >= data.totalPages} onClick={() => update("page", String(data.page + 1))}>Next page</button></div></> : null}</section>;
}
function page(value: string | null): number { const parsed = Number(value ?? 1); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
function status(value: string | null): OrderStatus | undefined { return statuses.find((candidate) => candidate === value); }
