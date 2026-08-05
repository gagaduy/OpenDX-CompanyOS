// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Archive, Folder, Pencil } from "lucide-react";
import type { Category } from "../types/catalog.types";

export function CategoryTree({ categories, onArchive, onEdit }: { readonly categories: readonly Category[]; readonly onArchive: (category: Category) => void; readonly onEdit: (category: Category) => void }) {
  if (categories.length === 0) return <div className="emptyState">No categories yet.</div>;
  const roots = categories.filter((category) => category.parentId === undefined || !categories.some((item) => item.id === category.parentId));
  return <ul className="categoryTree">{roots.map((category) => <CategoryNode key={category.id} category={category} categories={categories} onArchive={onArchive} onEdit={onEdit} />)}</ul>;
}

function CategoryNode({ category, categories, onArchive, onEdit }: { readonly category: Category; readonly categories: readonly Category[]; readonly onArchive: (category: Category) => void; readonly onEdit: (category: Category) => void }) {
  const children = categories.filter((item) => item.parentId === category.id);
  return <li><div className="categoryRow"><span><Folder size={16} /> <strong>{category.name}</strong><small>{category.slug} · {category.status}</small></span><div><button type="button" aria-label={`Edit ${category.name}`} onClick={() => onEdit(category)}><Pencil size={15} /></button>{category.status !== "archived" && <button type="button" aria-label={`Archive ${category.name}`} onClick={() => onArchive(category)}><Archive size={15} /></button>}</div></div>{children.length > 0 && <ul>{children.map((child) => <CategoryNode key={child.id} category={child} categories={categories} onArchive={onArchive} onEdit={onEdit} />)}</ul>}</li>;
}
