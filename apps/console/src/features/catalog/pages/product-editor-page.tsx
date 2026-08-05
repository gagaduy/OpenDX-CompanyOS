// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { CatalogApi } from "../api/catalog-api";
import { ProductForm } from "../components/product-form";
import { useCategories } from "../hooks/use-categories";
import { useProductEditor } from "../hooks/use-product-editor";

export function ProductEditorPage({ api }: { readonly api: CatalogApi }) {
  const { productId } = useParams(); const actualId = productId === "new" ? undefined : productId;
  const { categories, loading: categoriesLoading } = useCategories(api); const editor = useProductEditor(api, actualId);
  if (categoriesLoading || editor.loading) return <div className="pageState">Loading product editor…</div>;
  return <section className="catalogWorkspace"><header className="workspaceHeader editorHeader"><Link to="/products" aria-label="Back to products"><ArrowLeft size={17} /></Link><div><p className="sectionKicker">Catalog / Products</p><h1>{actualId ? editor.product?.name ?? "Product" : "New product"}</h1></div></header>{editor.notice && <p className="notice" role="status">{editor.notice}</p>}<ProductForm product={editor.product} categories={categories} onSave={editor.save} /></section>;
}
