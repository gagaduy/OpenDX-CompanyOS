// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
import { DialogShell } from "../../../shared/components/dialog-shell";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { CatalogApi } from "../api/catalog-api";
import { CategoryTree } from "../components/category-tree";
import { useCategories } from "../hooks/use-categories";
import type { Category } from "../types/catalog.types";

export function CategoryPage({ api }: { readonly api: CatalogApi }) {
  const { categories, loading, error, reload } = useCategories(api); const [name, setName] = useState(""); const [target, setTarget] = useState<Category>(); const [editTarget, setEditTarget] = useState<Category>(); const [editName, setEditName] = useState("");
  async function create(event: FormEvent) { event.preventDefault(); if (!name.trim()) return; await api.createCategory({ name: name.trim() }); setName(""); await reload(); }
  async function archive() { if (!target) return; await api.archiveCategory(target.id, target.version); setTarget(undefined); await reload(); }
  async function saveEdit(event: FormEvent) { event.preventDefault(); if (!editTarget || !editName.trim()) return; await api.updateCategory(editTarget.id, { name: editName.trim(), version: editTarget.version }); setEditTarget(undefined); await reload(); }
  function beginEdit(category: Category) { setEditTarget(category); setEditName(category.name); }
  return <section className="catalogWorkspace">
    <PageHeader eyebrow="Catalog" title="Categories" description="Organize the single-store assortment." breadcrumb={[{ label: "Catalog" }, { label: "Categories" }]} />
    <div className="categoryLayout"><div className="categoryPanel"><h2>Category tree</h2>{loading ? <SystemState kind="loading" title="Loading categories" /> : error ? <SystemState kind="error" title="Categories could not be loaded" action={<button className="secondaryButton" type="button" onClick={() => void reload()}>Retry</button>} /> : <CategoryTree categories={categories} onArchive={setTarget} onEdit={beginEdit} />}</div><aside className="categoryRail" aria-label="Category actions"><form className="compactForm" onSubmit={(event) => void create(event)}><p className="sectionKicker">New record</p><h2>Add category</h2><label>Category name<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="primaryButton" type="submit">Add category</button></form></aside></div>
    <DialogShell open={editTarget !== undefined} title="Edit category" mode="drawer" onClose={() => setEditTarget(undefined)}><form className="compactForm" onSubmit={(event) => void saveEdit(event)}><label>Edit category name<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><div className="dialogActions"><button className="secondaryButton" type="button" onClick={() => setEditTarget(undefined)}>Cancel</button><button className="primaryButton" type="submit">Save category</button></div></form></DialogShell>
    <DialogShell open={target !== undefined} title="Archive this category?" onClose={() => setTarget(undefined)}><p>Existing product history remains available.</p><div className="dialogActions"><button className="secondaryButton" type="button" onClick={() => setTarget(undefined)}>Cancel</button><button className="dangerButton" type="button" onClick={() => void archive()}>Archive</button></div></DialogShell>
  </section>;
}
