// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { PaymentOperationsApi } from "../api/payment-operations-api";
import { PaymentTable } from "../components/payment-table";
import { usePayments } from "../hooks/use-payments";
import type { PaymentStatus } from "../types/payment.types";

const statuses: readonly PaymentStatus[] = ["created", "pending_provider", "paid", "failed", "canceled", "expired"];
export function PaymentOperationsPage({ api }: { readonly api: PaymentOperationsApi }) { const [params, setParams] = useSearchParams(); const query = useMemo(() => ({ status: status(params.get("status")), page: page(params.get("page")), pageSize: 20 }), [params]); const { data, error, loading, reload } = usePayments(api, query); const update = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; }); return <section className="catalogWorkspace operationsWorkspace"><PageHeader eyebrow="Financial operations" title="Payments" description={`${data?.totalItems ?? 0} provider payment records`} /><div className="filterBar"><label><span>Status</span><select aria-label="Payment status" value={query.status ?? ""} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div>{loading && !data ? <SystemState kind="loading" title="Loading payments…" /> : error ? <SystemState kind="error" title="Payments could not be loaded" description={error} action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} /> : data?.items.length === 0 ? <SystemState kind="empty" title="No payments match this view." /> : data ? <><PaymentTable payments={data.items} /><div className="pagination"><span>{loading ? "Refreshing…" : `Page ${data.page} of ${Math.max(data.totalPages, 1)}`}</span><button className="secondaryButton" disabled={data.page <= 1} onClick={() => update("page", String(data.page - 1))}>Previous page</button><button className="secondaryButton" disabled={data.page >= data.totalPages} onClick={() => update("page", String(data.page + 1))}>Next page</button></div></> : null}</section>; }
function page(value: string | null): number { const parsed = Number(value ?? 1); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
function status(value: string | null): PaymentStatus | undefined { return statuses.find((candidate) => candidate === value); }
