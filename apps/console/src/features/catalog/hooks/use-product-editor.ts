// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { CatalogApiError, type CatalogApi } from "../api/catalog-api";
import type { Product, ProductInput, PublicationReadiness } from "../types/catalog.types";

export function useProductEditor(api: CatalogApi, productId?: string) {
  const [product, setProduct] = useState<Product>();
  const [loading, setLoading] = useState(productId !== undefined);
  const [notice, setNotice] = useState<string>();
  const [readiness, setReadiness] = useState<PublicationReadiness>();
  const [publicationPending, setPublicationPending] = useState(false);
  useEffect(() => {
    if (productId === undefined) return;
    let active = true;
    Promise.all([api.getProduct(productId), api.checkPublicationReadiness(productId)])
      .then(([value, publicationReadiness]) => { if (active) { setProduct(value); setReadiness(publicationReadiness); } })
      .catch(() => { if (active) setNotice("Unable to load this product."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, productId]);
  async function refreshReadiness() {
    if (productId === undefined) return;
    try { setReadiness(await api.checkPublicationReadiness(productId)); }
    catch { setNotice("Unable to check publication readiness."); }
  }
  async function save(input: ProductInput) {
    setNotice(undefined);
    try {
      const saved = productId === undefined
        ? await api.createProduct(input)
        : await api.updateProduct(productId, { ...input, version: product?.version ?? 1 });
      setProduct(saved);
      setNotice(productId === undefined ? "Product created." : "Product saved.");
      if (productId !== undefined) await refreshReadiness();
    } catch (error) {
      const code = error instanceof CatalogApiError ? error.code : "UNAVAILABLE";
      setNotice(code === "STALE_VERSION" ? "Refresh required before saving again." : code === "CONFLICT" ? "This slug already exists." : code === "FORBIDDEN" ? "Permission denied." : "Unable to save this product.");
    }
  }
  async function changePublication(action: "publish" | "unpublish") {
    if (productId === undefined || product === undefined) return;
    setNotice(undefined); setPublicationPending(true);
    try {
      const saved = action === "publish"
        ? await api.publishProduct(productId, product.version)
        : await api.unpublishProduct(productId, product.version);
      setProduct(saved);
      setNotice(action === "publish" ? "Product published." : "Product unpublished.");
      await refreshReadiness();
    } catch (error) {
      const code = error instanceof CatalogApiError ? error.code : "UNAVAILABLE";
      setNotice(code === "STALE_VERSION" ? "Refresh required before saving again." : code === "FORBIDDEN" ? "Permission denied." : code === "PRODUCT_NOT_READY_FOR_PUBLICATION" ? "Complete every publication requirement before publishing." : `Unable to ${action} this product.`);
    } finally { setPublicationPending(false); }
  }
  return { product, loading, notice, readiness, publicationPending, save, refreshReadiness, publish: () => changePublication("publish"), unpublish: () => changePublication("unpublish") };
}
