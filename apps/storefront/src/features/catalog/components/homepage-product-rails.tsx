// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  HomepageCatalogState,
  HomepageRailId,
} from "../hooks/use-homepage-catalog";
import { ProductCard } from "./product-card";

const tabs: readonly { id: HomepageRailId; label: string }[] = [
  { id: "featured", label: "Nổi bật" },
  { id: "bestSelling", label: "Bán chạy" },
  { id: "newest", label: "Mới nhất" },
];

export function HomepageProductRails({
  rails,
  apiBaseUrl,
}: {
  readonly rails: HomepageCatalogState["rails"];
  readonly apiBaseUrl: string;
}) {
  const [activeTab, setActiveTab] = useState<HomepageRailId>("featured");
  const region = rails[activeTab];

  return (
    <section className="homepage-product-section" aria-labelledby="featured-products-heading">
      <div className="commerce-section-heading product-section-heading">
        <h2 id="featured-products-heading">Sản phẩm nổi bật</h2>
        <div className="product-rail-tabs" role="tablist" aria-label="Nhóm sản phẩm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Link to="/products#catalog">Xem tất cả</Link>
      </div>
      {region.status === "loading" ? <p className="region-state">Đang tải sản phẩm...</p> : null}
      {region.status === "error" ? (
        <div className="region-state" role="alert">
          <span>Không thể tải nhóm sản phẩm này.</span>
          <button type="button" onClick={() => void region.retry()}>Thử lại</button>
        </div>
      ) : null}
      {region.status === "empty" ? <p className="region-state">Chưa có sản phẩm phù hợp.</p> : null}
      {region.status === "ready" ? (
        <div className="homepage-product-rail" role="tabpanel">
          {region.data.map((product) => (
            <ProductCard key={product.id} product={product} apiBaseUrl={apiBaseUrl} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
