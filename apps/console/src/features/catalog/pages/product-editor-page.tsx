// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CatalogApi } from "../api/catalog-api";
import { ProductForm } from "../components/product-form";
import { CatalogAuditTimeline } from "../components/catalog-audit-timeline";
import { MediaManager } from "../components/media-manager";
import { VariantEditor } from "../components/variant-editor";
import { useCategories } from "../hooks/use-categories";
import { useProductEditor } from "../hooks/use-product-editor";

export function ProductEditorPage({ api }: { readonly api: CatalogApi }) {
  const [tab, setTab] = useState<"product" | "variants" | "media" | "audit">("product");
  const { productId } = useParams(); const actualId = productId === "new" ? undefined : productId;
  const { categories, loading: categoriesLoading } = useCategories(api); const editor = useProductEditor(api, actualId);
  if (categoriesLoading || editor.loading) return <div className="pageState">Loading product editor…</div>;
  return <section className="catalogWorkspace"><header className="workspaceHeader editorHeader"><Link to="/products" aria-label="Back to products"><ArrowLeft size={17} /></Link><div><p className="sectionKicker">Catalog / Products</p><h1>{actualId ? editor.product?.name ?? "Product" : "New product"}</h1></div></header><div className="editorTabs" role="tablist" aria-label="Product editor sections"><button role="tab" aria-selected={tab === "product"} onClick={() => setTab("product")}>Product</button><button role="tab" aria-selected={tab === "variants"} disabled={!actualId} onClick={() => setTab("variants")}>Variants and prices</button><button role="tab" aria-selected={tab === "media"} disabled={!actualId} onClick={() => setTab("media")}>Media</button><button role="tab" aria-selected={tab === "audit"} disabled={!actualId} onClick={() => setTab("audit")}>Audit</button></div>{editor.notice && <p className="notice" role="status">{editor.notice}</p>}{tab === "product" && <ProductForm product={editor.product} categories={categories} onSave={editor.save} />}{tab === "variants" && actualId && <VariantEditor api={api} productId={actualId} />}{tab === "media" && actualId && <MediaManager api={api} productId={actualId} />}{tab === "audit" && actualId && <CatalogAuditTimeline api={api} productId={actualId} />}</section>;
}
