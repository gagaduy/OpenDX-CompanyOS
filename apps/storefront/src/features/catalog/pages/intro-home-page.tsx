// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Grid3X3, PackageSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { CategoryPromotionRail } from "../components/category-promotion-rail";
import { HomepageProductRails } from "../components/homepage-product-rails";
import {
  ServiceAssurancePanel,
  ServiceMetricStrip,
} from "../components/service-assurance-panel";
import { StorefrontHero } from "../components/storefront-hero";
import {
  useHomepageCatalog,
  type HomepageCatalogReader,
} from "../hooks/use-homepage-catalog";

export function IntroHomePage({
  api,
  apiBaseUrl,
}: {
  readonly api: HomepageCatalogReader;
  readonly apiBaseUrl: string;
}) {
  const catalog = useHomepageCatalog(api);
  const fallbackProduct = catalog.rails.featured.data[0];

  return (
    <main id="main-content" className="commerce-home-page">
      <div className="commerce-home-primary">
        <aside className="homepage-category-rail" aria-label="Danh mục sản phẩm">
          <h2><Grid3X3 aria-hidden="true" /> Danh mục sản phẩm</h2>
          {catalog.categories.status === "loading" ? (
            <p className="region-state">Đang tải danh mục...</p>
          ) : null}
          {catalog.categories.status === "error" ? (
            <div className="region-state" role="alert">
              <span>Không thể tải danh mục.</span>
              <button type="button" onClick={() => void catalog.categories.retry()}>
                Thử lại
              </button>
            </div>
          ) : null}
          {catalog.categories.status === "empty" ? (
            <p className="region-state"><PackageSearch aria-hidden="true" /> Danh mục đang cập nhật.</p>
          ) : null}
          {catalog.categories.status === "ready" ? (
            <nav aria-label="Danh mục công nghệ">
              {catalog.categories.data.map((category) => (
                <Link
                  key={category.id}
                  to={`/products?category=${encodeURIComponent(category.slug)}#catalog`}
                >
                  <span>{category.name}</span><span aria-hidden="true">›</span>
                </Link>
              ))}
            </nav>
          ) : null}
          <Link className="category-all-link" to="/products#categories">Xem tất cả</Link>
        </aside>

        <div className="homepage-hero-region">
          {catalog.hero.status === "loading" && fallbackProduct === undefined ? (
            <p className="region-state hero-state">Đang tải sản phẩm nổi bật...</p>
          ) : null}
          {catalog.hero.status === "error" && fallbackProduct === undefined ? (
            <div className="region-state hero-state" role="alert">
              <span>Không thể tải khu vực nổi bật.</span>
              <button type="button" onClick={() => void catalog.hero.retry()}>Thử lại</button>
            </div>
          ) : null}
          <StorefrontHero
            presentation={catalog.hero.data}
            fallbackProduct={fallbackProduct}
            apiBaseUrl={apiBaseUrl}
          />
        </div>

        <ServiceAssurancePanel />
      </div>

      <CategoryPromotionRail region={catalog.promotions} apiBaseUrl={apiBaseUrl} />
      <HomepageProductRails rails={catalog.rails} apiBaseUrl={apiBaseUrl} />
      <ServiceMetricStrip />
    </main>
  );
}
