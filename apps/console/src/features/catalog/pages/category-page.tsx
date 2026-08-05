// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
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
  return <section className="catalogWorkspace"><header className="workspaceHeader splitHeader"><div><p className="sectionKicker">Catalog</p><h1>Categories</h1><p>Organize the single-store assortment.</p></div></header><div className="categoryLayout"><form className="compactForm" onSubmit={(event) => void create(event)}><h2>Add category</h2><label>Category name<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="primaryButton" type="submit">Add category</button></form><div className="categoryPanel"><h2>Category tree</h2>{loading ? <div className="pageState">Loading categories…</div> : error ? <div className="pageState"><p>Categories could not be loaded.</p><button className="secondaryButton" onClick={() => void reload()}>Retry</button></div> : <CategoryTree categories={categories} onArchive={setTarget} onEdit={beginEdit} />}</div></div>{editTarget && <div className="dialogBackdrop" role="presentation"><form className="confirmDialog compactForm" role="dialog" aria-modal="true" onSubmit={(event) => void saveEdit(event)}><h2>Edit category</h2><label>Edit category name<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><div><button className="secondaryButton" type="button" onClick={() => setEditTarget(undefined)}>Cancel</button><button className="primaryButton" type="submit">Save category</button></div></form></div>}{target && <div className="dialogBackdrop" role="presentation"><div className="confirmDialog" role="dialog" aria-modal="true"><h2>Archive this category?</h2><p>Existing product history remains available.</p><div><button className="secondaryButton" type="button" onClick={() => setTarget(undefined)}>Cancel</button><button className="dangerButton" type="button" onClick={() => void archive()}>Archive</button></div></div></div>}</section>;
}
