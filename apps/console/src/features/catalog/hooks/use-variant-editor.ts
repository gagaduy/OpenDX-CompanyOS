// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { CatalogApiError, type CatalogApi } from "../api/catalog-api";
import type { ProductPrice, ProductVariant } from "../types/catalog.types";

export function useVariantEditor(api: CatalogApi, productId: string) {
  const [variants, setVariants] = useState<readonly ProductVariant[]>([]);
  const [prices, setPrices] = useState<Readonly<Record<string, ProductPrice>>>({});
  const [notice, setNotice] = useState<string>();
  async function create(input: { readonly sku: string; readonly title: string; readonly optionValues: Readonly<Record<string, string>> }) {
    setNotice(undefined);
    try { const value = await api.createVariant(productId, input); setVariants((current) => [...current, value]); }
    catch (error) { setNotice(error instanceof CatalogApiError && error.code === "CONFLICT" ? "This SKU already exists." : "Unable to create variant."); }
  }
  async function archive(variant: ProductVariant) {
    setNotice(undefined);
    try { const value = await api.archiveVariant(productId, variant.id, variant.version); setVariants((current) => current.map((item) => item.id === value.id ? value : item)); }
    catch { setNotice("Unable to archive this variant."); }
  }
  async function replacePrice(variantId: string, amountMinor: number) {
    setNotice(undefined);
    try { const value = await api.replacePrice(productId, variantId, amountMinor); setPrices((current) => ({ ...current, [variantId]: value })); }
    catch { setNotice("Unable to replace this price."); }
  }
  return { variants, prices, notice, create, archive, replacePrice };
}
