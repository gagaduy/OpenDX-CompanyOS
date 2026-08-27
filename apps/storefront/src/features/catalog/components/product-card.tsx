// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import { useCart } from "../../cart";
import { WishlistButton } from "../../wishlist";
import type { StorefrontProduct } from "../types/catalog.types";

export interface ProductCardProps {
  readonly product: StorefrontProduct;
  readonly apiBaseUrl: string;
  readonly layout?: "grid" | "rail";
  readonly showCartAction?: boolean;
}

export function ProductCard({
  product,
  apiBaseUrl,
  layout = "grid",
  showCartAction = true,
}: ProductCardProps) {
  const { add, loading: cartLoading } = useCart();
  const pricedVariants = [...product.variants].sort(
    (left, right) => left.price.amountMinor - right.price.amountMinor,
  );
  const displayVariant = pricedVariants[0];
  const purchasableVariant = pricedVariants.find((variant) => variant.purchasable);
  const available = purchasableVariant !== undefined;
  return (
    <article className={`product-card ${layout}`}>
      <Link
        to={`/products/${product.slug}`}
        className="product-media-link"
        aria-label={`Xem ${product.name}`}
      >
        <img
          src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
          alt={product.primaryMedia.altText}
          loading="lazy"
          width="360"
          height="270"
        />
      </Link>
      <div className="product-card-wishlist">
        <WishlistButton productId={product.id} productName={product.name} />
      </div>
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
        {displayVariant === undefined ? (
          <p className="price">Giá đang cập nhật</p>
        ) : (
          <div className="product-card-price">
            <p className="price">{formatVnd(displayVariant.price.amountMinor)}</p>
            {displayVariant.price.previousAmountMinor === undefined ? null : (
              <del>{formatVnd(displayVariant.price.previousAmountMinor)}</del>
            )}
            {displayVariant.price.discountPercentage === undefined ? null : (
              <span className="discount-badge">
                -{displayVariant.price.discountPercentage}%
              </span>
            )}
          </div>
        )}
        {showCartAction ? (
          <button
            type="button"
            className="product-card-cart"
            aria-label={
              available ? `Thêm ${product.name} vào giỏ hàng` : "Tạm hết hàng"
            }
            disabled={!available || cartLoading}
            onClick={() => {
              if (purchasableVariant !== undefined) {
                void add(purchasableVariant.id, 1);
              }
            }}
          >
            <ShoppingCart aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
