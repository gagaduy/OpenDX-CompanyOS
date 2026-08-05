// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Archive, Image, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CatalogApi } from "../api/catalog-api";
import type { ProductListItem } from "../types/catalog.types";

export function ProductTable({ api, products, onArchive }: { readonly api: CatalogApi; readonly products: readonly ProductListItem[]; readonly onArchive: (product: ProductListItem) => void }) {
  return <div className="tableFrame"><table className="productTable"><thead><tr><th>Product</th><th>Category</th><th>Variants</th><th>Price range</th><th>Status</th><th>Updated</th><th><span className="srOnly">Actions</span></th></tr></thead><tbody>{products.map((product) => <tr key={product.id}>
    <td><div className="productIdentity"><ProductThumbnail api={api} product={product} /><span><Link to={`/products/${product.id}`}>{product.name}</Link><small>{product.brand ?? "No brand"} · {product.slug}</small></span></div></td>
    <td>{product.categoryName}</td><td>{product.variantCount}</td><td>{formatPrice(product.minimumPrice, product.maximumPrice)}</td><td><span className={`status status-${product.status}`}>{product.status}</span></td><td>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(product.updatedAt))}</td>
    <td><div className="rowActions"><Link aria-label={`Edit ${product.name}`} to={`/products/${product.id}`}><Pencil size={15} /></Link><button type="button" aria-label={`Archive ${product.name}`} onClick={() => onArchive(product)}><Archive size={15} /></button></div></td>
  </tr>)}</tbody></table></div>;
}

function ProductThumbnail({ api, product }: { readonly api: CatalogApi; readonly product: ProductListItem }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    if (product.primaryMediaId !== undefined) {
      void api.loadMediaPreview(product.id, product.primaryMediaId).then((loaded) => {
        objectUrl = loaded;
        if (active) setSource(loaded);
        else revoke(loaded);
      }).catch(() => undefined);
    }
    return () => {
      active = false;
      if (objectUrl !== undefined) revoke(objectUrl);
    };
  }, [api, product.id, product.primaryMediaId]);
  return <span className="thumbnail">{source === undefined ? <Image size={16} aria-hidden="true" /> : <img src={source} alt={`${product.name} thumbnail`} />}</span>;
}

function revoke(source: string): void {
  if (source.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(source);
}

function formatPrice(minimum?: number, maximum?: number): string {
  if (minimum === undefined) return "Not priced";
  const format = (amount: number) => `₫${new Intl.NumberFormat("en-US").format(amount)}`;
  return maximum !== undefined && maximum !== minimum ? `${format(minimum)} – ${format(maximum)}` : format(minimum);
}
