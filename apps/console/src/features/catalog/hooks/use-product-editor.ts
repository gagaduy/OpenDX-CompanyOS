// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { CatalogApiError, type CatalogApi } from "../api/catalog-api";
import type { Product, ProductInput } from "../types/catalog.types";

export function useProductEditor(api: CatalogApi, productId?: string) {
  const [product, setProduct] = useState<Product>();
  const [loading, setLoading] = useState(productId !== undefined);
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    if (productId === undefined) return;
    let active = true;
    api.getProduct(productId).then((value) => { if (active) setProduct(value); }).catch(() => { if (active) setNotice("Unable to load this product."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, productId]);
  async function save(input: ProductInput) {
    setNotice(undefined);
    try {
      const saved = productId === undefined
        ? await api.createProduct(input)
        : await api.updateProduct(productId, { ...input, version: product?.version ?? 1 });
      setProduct(saved);
      setNotice(productId === undefined ? "Product created." : "Product saved.");
    } catch (error) {
      const code = error instanceof CatalogApiError ? error.code : "UNAVAILABLE";
      setNotice(code === "STALE_VERSION" ? "Refresh required before saving again." : code === "CONFLICT" ? "This slug already exists." : code === "FORBIDDEN" ? "Permission denied." : "Unable to save this product.");
    }
  }
  return { product, loading, notice, save };
}
