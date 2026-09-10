// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontProduct } from "../types/catalog.types";
import { ProductCard } from "./product-card";
export function ProductGrid({
  products,
  apiBaseUrl,
}: {
  readonly products: readonly StorefrontProduct[];
  readonly apiBaseUrl: string;
}) {
  return (
    <div className="product-grid" role="list" aria-label="Danh sách sản phẩm">
      {products.map((product) => (
        <div key={product.id} role="listitem">
          <ProductCard product={product} apiBaseUrl={apiBaseUrl} />
        </div>
      ))}
    </div>
  );
}
