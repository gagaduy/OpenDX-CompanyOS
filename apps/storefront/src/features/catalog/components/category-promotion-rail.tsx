// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  CategoryPromotion,
  HomepageRegion,
} from "../hooks/use-homepage-catalog";

export function CategoryPromotionRail({
  region,
  apiBaseUrl,
}: {
  readonly region: HomepageRegion<readonly CategoryPromotion[]>;
  readonly apiBaseUrl: string;
}) {
  return (
    <section className="category-promotion-section" aria-labelledby="promotion-heading">
      <div className="commerce-section-heading">
        <div>
          <span className="eyebrow">Khám phá theo nhu cầu</span>
          <h2 id="promotion-heading">Danh mục công nghệ</h2>
        </div>
        <Link to="/products#categories">Xem tất cả <ArrowRight aria-hidden="true" /></Link>
      </div>
      {region.status === "loading" ? <p className="region-state">Đang tải danh mục...</p> : null}
      {region.status === "error" ? (
        <div className="region-state" role="alert">
          <span>Không thể tải gợi ý danh mục.</span>
          <button type="button" onClick={() => void region.retry()}>Thử lại</button>
        </div>
      ) : null}
      {region.status === "empty" ? <p className="region-state">Danh mục đang được cập nhật.</p> : null}
      {region.status === "ready" ? (
        <div className="category-promotion-rail">
          {region.data.map(({ category, product }) => (
            <Link
              className="category-promotion-card"
              key={category.id}
              to={`/products?category=${encodeURIComponent(category.slug)}#catalog`}
            >
              <span>
                <small>{category.name}</small>
                <strong>{product.name}</strong>
                <em>Xem ngay <ArrowRight aria-hidden="true" /></em>
              </span>
              <img
                src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
                alt={product.primaryMedia.altText}
                loading="lazy"
                width="320"
                height="180"
              />
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
