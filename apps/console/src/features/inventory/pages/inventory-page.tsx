// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DialogShell } from "../../../shared/components/dialog-shell";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { InventoryApiError, type InventoryApi } from "../api/inventory-api";
import { InventoryDetailPanel } from "../components/inventory-detail-panel";
import { InventoryTable } from "../components/inventory-table";
import { StockMutationDialog, type StockMutation } from "../components/stock-mutation-dialog";
import { useInventory } from "../hooks/use-inventory";
import type { InventoryItemView, InventoryStockStatus } from "../types/inventory.types";

export function InventoryPage({ api, roles }: { readonly api: InventoryApi; readonly roles: readonly StaffRole[] }) {
  const [params, setParams] = useSearchParams(); const [detail, setDetail] = useState<InventoryItemView>(); const [mutation, setMutation] = useState<{ item: InventoryItemView; mode: "receive" | "adjust" }>(); const [mutationError, setMutationError] = useState<string>(); const [pending, setPending] = useState(false); const [notice, setNotice] = useState<string>();
  const query = useMemo(() => ({ query: params.get("query") || undefined, categoryId: params.get("categoryId") || undefined, stockStatus: (params.get("stockStatus") || undefined) as InventoryStockStatus | undefined, page: positivePage(params.get("page")), pageSize: 20 }), [params]);
  const { data, loading, error, reload } = useInventory(api, query); const canWrite = roles.includes("administrator") || roles.includes("inventory_manager");
  function update(key: string, value: string) { setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; }); }
  function openMutation(item: InventoryItemView, mode: "receive" | "adjust") { setMutationError(undefined); setNotice(undefined); setMutation({ item, mode }); }
  async function submit(value: StockMutation) { if (!mutation) return; setPending(true); setMutationError(undefined); try { if (value.mode === "receive") { await api.receive({ variantId: mutation.item.variantId, quantity: value.quantity, idempotencyKey: `console:${crypto.randomUUID()}` }); setNotice("Stock receipt saved."); } else { await api.adjust(mutation.item.id, { delta: value.delta, reasonCode: "MANUAL_ADJUSTMENT", reasonNote: value.reason, version: mutation.item.version }); setNotice("Stock adjustment saved."); } setMutation(undefined); reload(); } catch (reason) { setMutationError(reason instanceof InventoryApiError ? reason.message : "The stock change could not be saved."); } finally { setPending(false); } }
  const visibleItems = data?.items ?? []; const lowCount = visibleItems.filter((item) => item.stockStatus === "low").length; const outCount = visibleItems.filter((item) => item.stockStatus === "out_of_stock").length; const available = visibleItems.reduce((sum, item) => sum + item.available, 0);
  return <section className="catalogWorkspace inventoryWorkspace">
    <PageHeader eyebrow="Operations" title="Inventory" description={`${data?.totalItems ?? 0} stocked variants across NovaCommerce`} breadcrumb={[{ label: "Operations" }, { label: "Inventory" }]} />
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="inventorySummary" aria-label="Inventory summary"><p className="sectionKicker">Visible results</p><div><article><span>Variants</span><strong>{visibleItems.length}</strong></article><article><span>Available units</span><strong>{available}</strong></article><article><span>Low stock</span><strong>{lowCount}</strong></article><article><span>Out of stock</span><strong>{outCount}</strong></article></div></section>
    <section className="filterBar" aria-label="Inventory filters"><label className="searchControl"><Search size={15} aria-hidden="true" /><span className="srOnly">Search inventory</span><input type="search" aria-label="Search inventory" placeholder="Search product or SKU" value={query.query ?? ""} onChange={(event) => update("query", event.target.value)} /></label><label><span>Stock status</span><select aria-label="Stock status" value={query.stockStatus ?? ""} onChange={(event) => update("stockStatus", event.target.value)}><option value="">All stock</option><option value="healthy">Healthy</option><option value="low">Low stock</option><option value="out_of_stock">Out of stock</option></select></label></section>
    {loading && data === undefined ? <SystemState kind="loading" title="Loading inventory" /> : error ? <SystemState kind="error" title="Inventory data could not be loaded" action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} /> : data?.items.length === 0 ? <SystemState kind="empty" title="No inventory items found" description="Adjust the filters or receive stock for an active variant." /> : data ? <><InventoryTable items={data.items} canWrite={canWrite} onView={setDetail} onReceive={(item) => openMutation(item, "receive")} onAdjust={(item) => openMutation(item, "adjust")} /><div className="pagination"><span>{loading ? "Refreshing…" : `Page ${data.page} of ${Math.max(data.totalPages, 1)}`}</span><button type="button" className="secondaryButton" disabled={data.page <= 1} onClick={() => update("page", String(data.page - 1))}>Previous page</button><button type="button" className="secondaryButton" aria-label="Next page" disabled={data.page >= data.totalPages} onClick={() => update("page", String(data.page + 1))}>Next page</button></div></> : null}
    <DialogShell open={detail !== undefined} title={`Inventory detail · ${detail?.sku ?? ""}`} mode="drawer" onClose={() => setDetail(undefined)}>{detail && <InventoryDetailPanel api={api} item={detail} onClose={() => setDetail(undefined)} />}</DialogShell>
    {mutation && <StockMutationDialog item={mutation.item} mode={mutation.mode} pending={pending} serverError={mutationError} onCancel={() => setMutation(undefined)} onSubmit={submit} />}
  </section>;
}

function positivePage(value: string | null): number { const parsed = Number(value ?? 1); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
