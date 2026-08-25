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
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          apiBaseUrl={apiBaseUrl}
        />
      ))}
    </div>
  );
}
