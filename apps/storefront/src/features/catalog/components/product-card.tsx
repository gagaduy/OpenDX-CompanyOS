// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { StorefrontProduct } from "../types/catalog.types";

export function ProductCard({
  product,
  apiBaseUrl,
}: {
  readonly product: StorefrontProduct;
  readonly apiBaseUrl: string;
}) {
  const lowestPrice = Math.min(
    ...product.variants.map((variant) => variant.price.amountMinor),
  );
  const available = product.variants.some((variant) => variant.purchasable);
  return (
    <article className="product-card">
      <Link
        to={`/products/${product.slug}`}
        className="product-media-link"
        aria-label={`Xem ${product.name}`}
      >
        <img
          src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
          alt={product.primaryMedia.altText}
        />
      </Link>
      <div className="product-card-body">
        <div className="product-card-meta">
          <span className="product-category">{product.categoryName}</span>
          <span className={available ? "stock in-stock" : "stock sold-out"}>
            {available ? "Còn hàng" : "Tạm hết hàng"}
          </span>
        </div>
        <h2>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h2>
        <p className="price">{formatVnd(lowestPrice)}</p>
      </div>
    </article>
  );
}
