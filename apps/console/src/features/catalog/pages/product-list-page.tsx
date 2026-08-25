// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DialogShell } from "../../../shared/components/dialog-shell";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { CatalogApi } from "../api/catalog-api";
import { ProductTable } from "../components/product-table";
import { useCategories } from "../hooks/use-categories";
import { useProducts } from "../hooks/use-products";
import type { ProductListItem } from "../types/catalog.types";

export function ProductListPage({ api }: { readonly api: CatalogApi }) {
  const [params, setParams] = useSearchParams(); const [archiveTarget, setArchiveTarget] = useState<ProductListItem>();
  const query = useMemo(() => ({ query: params.get("query") || undefined, categoryId: params.get("categoryId") || undefined, status: (params.get("status") || undefined) as "draft" | "published" | "archived" | undefined, page: Number(params.get("page") ?? 1), pageSize: 20 }), [params]);
  const { data, loading, error, reload } = useProducts(api, query); const { categories } = useCategories(api);
  function update(key: string, value: string) { setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; }); }
  async function archive() { if (!archiveTarget) return; await api.archiveProduct(archiveTarget.id, archiveTarget.version); setArchiveTarget(undefined); reload(); }
  return <section className="catalogWorkspace">
    <PageHeader eyebrow="Catalog" title="Products" description={`${data?.totalItems ?? 0} products in NovaCommerce`} breadcrumb={[{ label: "Catalog" }, { label: "Products" }]} actions={<Link className="primaryButton" to="/products/new"><Plus size={16} aria-hidden="true" /> New product</Link>} />
    <section className="filterBar" aria-label="Product filters"><label className="searchControl"><Search size={15} aria-hidden="true" /><span className="srOnly">Search products</span><input type="search" aria-label="Search products" placeholder="Search name, slug, or brand" value={query.query ?? ""} onChange={(event) => update("query", event.target.value)} /></label><label><span>Status</span><select aria-label="Status" value={query.status ?? ""} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label><span>Category</span><select aria-label="Category filter" value={query.categoryId ?? ""} onChange={(event) => update("categoryId", event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></section>
    {loading && data === undefined ? <SystemState kind="loading" title="Loading products" /> : error ? <SystemState kind="error" title="Catalog data could not be loaded" action={<button className="secondaryButton" type="button" onClick={reload}>Retry</button>} /> : data?.items.length === 0 ? <SystemState kind="empty" title="No products found" description="Adjust filters or create the first product." /> : data ? <><ProductTable api={api} products={data.items} onArchive={setArchiveTarget} /><div className="pagination"><span>{loading ? "Refreshing…" : `Page ${data.page} of ${Math.max(data.totalPages, 1)}`}</span><button type="button" className="secondaryButton" disabled={data.page <= 1} onClick={() => update("page", String(data.page - 1))}>Previous page</button><button type="button" className="secondaryButton" aria-label="Next page" disabled={data.page >= data.totalPages} onClick={() => update("page", String(data.page + 1))}>Next page</button></div></> : null}
    <DialogShell open={archiveTarget !== undefined} title="Archive this product?" onClose={() => setArchiveTarget(undefined)}><p>{archiveTarget?.name} will be removed from active catalog work.</p><div className="dialogActions"><button className="secondaryButton" type="button" onClick={() => setArchiveTarget(undefined)}>Cancel</button><button className="dangerButton" type="button" onClick={() => void archive()}>Archive</button></div></DialogShell>
  </section>;
}
