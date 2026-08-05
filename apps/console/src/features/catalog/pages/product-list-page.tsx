// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Plus, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import type { CatalogApi } from "../api/catalog-api";
import { ProductTable } from "../components/product-table";
import { useCategories } from "../hooks/use-categories";
import { useProducts } from "../hooks/use-products";
import type { ProductListItem } from "../types/catalog.types";

export function ProductListPage({ api }: { readonly api: CatalogApi }) {
  const [params, setParams] = useSearchParams(); const [archiveTarget, setArchiveTarget] = useState<ProductListItem>();
  const query = useMemo(() => ({ query: params.get("query") || undefined, categoryId: params.get("categoryId") || undefined, status: (params.get("status") || undefined) as "draft" | "archived" | undefined, page: Number(params.get("page") ?? 1), pageSize: 20 }), [params]);
  const { data, loading, error, reload } = useProducts(api, query); const { categories } = useCategories(api);
  function update(key: string, value: string) { setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; }); }
  async function archive() { if (!archiveTarget) return; await api.archiveProduct(archiveTarget.id, archiveTarget.version); setArchiveTarget(undefined); reload(); }
  return <section className="catalogWorkspace"><header className="workspaceHeader splitHeader"><div><p className="sectionKicker">Catalog</p><h1>Products</h1><p>{data?.totalItems ?? 0} products in NovaCommerce</p></div><Link className="primaryButton" to="/products/new"><Plus size={16} /> New product</Link></header>
    <div className="filterBar"><label className="searchControl"><Search size={15} /><span className="srOnly">Search products</span><input type="search" aria-label="Search products" placeholder="Search name, slug, or brand" value={query.query ?? ""} onChange={(event) => update("query", event.target.value)} /></label><label><span>Status</span><select aria-label="Status" value={query.status ?? ""} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label><label><span>Category</span><select aria-label="Category filter" value={query.categoryId ?? ""} onChange={(event) => update("categoryId", event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
    {loading && data === undefined ? <div className="pageState">Loading products…</div> : error ? <div className="pageState"><p>Catalog data could not be loaded.</p><button className="secondaryButton" type="button" onClick={reload}>Retry</button></div> : data?.items.length === 0 ? <div className="emptyState">No products found. Adjust filters or create the first product.</div> : data ? <><ProductTable api={api} products={data.items} onArchive={setArchiveTarget} /><div className="pagination"><span>{loading ? "Refreshing…" : `Page ${data.page} of ${Math.max(data.totalPages, 1)}`}</span><button type="button" className="secondaryButton" disabled={data.page <= 1} onClick={() => update("page", String(data.page - 1))}>Previous page</button><button type="button" className="secondaryButton" aria-label="Next page" disabled={data.page >= data.totalPages} onClick={() => update("page", String(data.page + 1))}>Next page</button></div></> : null}
    {archiveTarget && <div className="dialogBackdrop" role="presentation"><div className="confirmDialog" role="dialog" aria-modal="true" aria-labelledby="archive-title"><h2 id="archive-title">Archive this product?</h2><p>{archiveTarget.name} will be removed from active catalog work.</p><div><button className="secondaryButton" type="button" onClick={() => setArchiveTarget(undefined)}>Cancel</button><button className="dangerButton" type="button" onClick={() => void archive()}>Archive</button></div></div></div>}
  </section>;
}
