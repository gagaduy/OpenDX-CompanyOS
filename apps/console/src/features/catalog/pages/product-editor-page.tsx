// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ComingSoonControl } from "../../../shared/components/coming-soon-control";
import { PageHeader } from "../../../shared/components/page-header";
import { SystemState } from "../../../shared/components/system-state";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import type { CatalogApi } from "../api/catalog-api";
import { CatalogAuditTimeline } from "../components/catalog-audit-timeline";
import { MediaManager } from "../components/media-manager";
import { ProductForm } from "../components/product-form";
import { PublicationPanel } from "../components/publication-panel";
import { VariantEditor } from "../components/variant-editor";
import { useCategories } from "../hooks/use-categories";
import { useProductEditor } from "../hooks/use-product-editor";

type EditorTab = "product" | "variants" | "media" | "publication" | "audit";

export function ProductEditorPage({ api, roles = ["catalog_manager"] }: { readonly api: CatalogApi; readonly roles?: readonly StaffRole[] }) {
  const [tab, setTab] = useState<EditorTab>("product"); const navigate = useNavigate();
  const { productId } = useParams(); const actualId = productId === "new" ? undefined : productId;
  const { categories, loading: categoriesLoading } = useCategories(api); const editor = useProductEditor(api, actualId);
  async function saveProduct(input: Parameters<typeof editor.save>[0]) { const saved = await editor.save(input); if (actualId === undefined && saved !== undefined) navigate(`/products/${saved.id}`, { replace: true }); }
  if (categoriesLoading || editor.loading) return <SystemState kind="loading" title="Loading product editor" />;
  const canPublish = roles.includes("administrator") || roles.includes("catalog_manager");
  const title = actualId ? editor.product?.name ?? "Product" : "Create product";
  return <section className="catalogWorkspace productEditorWorkspace">
    <PageHeader eyebrow="Catalog / Products" title={title} breadcrumb={[{ label: "Catalog" }, { label: "Products", to: "/products" }, { label: actualId ? "Editor" : "New product" }]} actions={<Link className="secondaryButton" to="/products"><ArrowLeft size={16} aria-hidden="true" /> Products</Link>} />
    <div className="editorTabs" role="tablist" aria-label="Product editor sections"><button role="tab" aria-selected={tab === "product"} onClick={() => setTab("product")}>Product</button><button role="tab" aria-selected={tab === "variants"} disabled={!actualId} onClick={() => setTab("variants")}>Variants and prices</button><button role="tab" aria-selected={tab === "media"} disabled={!actualId} onClick={() => setTab("media")}>Media</button><button role="tab" aria-selected={tab === "publication"} disabled={!actualId} onClick={() => { setTab("publication"); void editor.refreshReadiness(); }}>Publication</button><button role="tab" aria-selected={tab === "audit"} disabled={!actualId} onClick={() => setTab("audit")}>Audit</button></div>
    {editor.notice && <p className="notice" role="status">{editor.notice}</p>}
    <div className={actualId === undefined ? "editorCanvas editorCanvasWithRail" : "editorCanvas"}><div className="editorTabContent">
      {tab === "product" && <><ProductForm product={editor.product} categories={categories} onSave={saveProduct} /><ComingSoonControl label="Product tags" /></>}
      {tab === "variants" && actualId && <VariantEditor api={api} productId={actualId} />}
      {tab === "media" && actualId && <MediaManager api={api} productId={actualId} />}
      {tab === "publication" && editor.product && <PublicationPanel product={editor.product} readiness={editor.readiness} canPublish={canPublish} pending={editor.publicationPending} onPublish={editor.publish} onUnpublish={editor.unpublish} />}
      {tab === "audit" && actualId && <CatalogAuditTimeline api={api} productId={actualId} />}
    </div>{actualId === undefined && <aside className="setupRail" aria-label="Product setup progress"><div><span>Setup progress</span><strong>25%</strong></div><ol><li className="active">Basic information</li><li>Variants and inventory</li><li>Media assets</li><li>Publication</li></ol></aside>}</div>
  </section>;
}
