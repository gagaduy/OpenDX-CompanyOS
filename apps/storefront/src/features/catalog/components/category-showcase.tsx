// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type {
  StorefrontCategory,
  StorefrontProduct,
} from "../types/catalog.types";

export function CategoryShowcase({
  categories,
  products,
  apiBaseUrl,
}: {
  readonly categories: readonly StorefrontCategory[];
  readonly products: readonly StorefrontProduct[];
  readonly apiBaseUrl: string;
}) {
  const entries = categories
    .map((category) => ({
      category,
      product: products.find((product) => product.categoryId === category.id),
    }))
    .filter(
      (entry): entry is typeof entry & { product: StorefrontProduct } =>
        entry.product !== undefined,
    )
    .slice(0, 3);

  if (entries.length === 0) return null;

  return (
    <section id="categories" className="category-showcase">
      <header className="section-heading">
        <div>
          <span className="eyebrow">Tuyển chọn cho bạn</span>
          <h2>Khám phá danh mục</h2>
        </div>
        <a href="#catalog">
          Xem tất cả <ArrowRight />
        </a>
      </header>
      <div className="category-mosaic">
        {entries.map(({ category, product }, index) => {
          const price = Math.min(
            ...product.variants.map((variant) => variant.price.amountMinor),
          );
          return (
            <Link
              className={index === 0 ? "category-tile featured" : "category-tile"}
              key={category.id}
              to={`/?category=${encodeURIComponent(category.slug)}#catalog`}
            >
              <img
                src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
                alt={`${product.primaryMedia.altText} trong danh mục ${category.name}`}
              />
              <span className="category-tile-scrim" />
              <span className="category-tile-copy">
                <small>{index === 0 ? "Nổi bật" : "Danh mục"}</small>
                <strong>{category.name}</strong>
                <span>{index === 0 ? `Từ ${formatVnd(price)}` : "Khám phá"}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
