// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowDown, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { StorefrontProduct } from "../types/catalog.types";

export function StorefrontHero({
  product,
  apiBaseUrl,
}: {
  readonly product: StorefrontProduct;
  readonly apiBaseUrl: string;
}) {
  const price = Math.min(
    ...product.variants.map((variant) => variant.price.amountMinor),
  );
  return (
    <section className="storefront-hero" aria-labelledby="hero-title">
      <img
        src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
        alt={product.primaryMedia.altText}
      />
      <div className="hero-scrim" />
      <div className="hero-content">
        <span className="hero-eyebrow">Sản phẩm nổi bật</span>
        <h1 id="hero-title">{product.name}</h1>
        <p>{product.description}</p>
        <div className="hero-actions">
          <Link className="button primary" to={`/products/${product.slug}`}>
            Khám phá ngay <ArrowRight />
          </Link>
          <span>Từ {formatVnd(price)}</span>
        </div>
      </div>
      <a className="hero-scroll" href="#categories" aria-label="Xem danh mục">
        <ArrowDown />
      </a>
    </section>
  );
}
