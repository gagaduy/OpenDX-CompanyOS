// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";
import { formatVnd } from "../../../../shared/format/currency";
import type { StorefrontProduct } from "../../types/catalog.types";

export function HomepageProductOverlay({
  product,
  apiBaseUrl,
  fallbackHref,
}: {
  readonly product?: StorefrontProduct;
  readonly apiBaseUrl: string;
  readonly fallbackHref: string;
}) {
  if (product === undefined) {
    return (
      <Link className="button secondary" to={fallbackHref}>
        Khám phá sản phẩm
      </Link>
    );
  }

  const prices = product.variants.map((variant) => variant.price.amountMinor);
  const minimumPrice = prices.length > 0 ? Math.min(...prices) : undefined;
  const available = product.variants.some((variant) => variant.purchasable);

  return (
    <article className="homepage-product-overlay">
      <img
        src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
        alt={product.primaryMedia.altText}
      />
      <div>
        <span>{product.categoryName}</span>
        <h3>{product.name}</h3>
        <p className="price">
          {minimumPrice === undefined
            ? "Giá đang cập nhật"
            : formatVnd(minimumPrice)}
        </p>
        <span className={available ? "stock in-stock" : "stock sold-out"}>
          {available ? "Còn hàng" : "Tạm hết hàng"}
        </span>
        <Link className="button primary" to={`/products/${product.slug}`}>
          Xem {product.name}
        </Link>
      </div>
    </article>
  );
}
