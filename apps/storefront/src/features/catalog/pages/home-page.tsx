// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useSearchParams } from "react-router-dom";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { CatalogFilters } from "../components/catalog-filters";
import { CategoryShowcase } from "../components/category-showcase";
import { ProductGrid } from "../components/product-grid";
import { StorefrontHero } from "../components/storefront-hero";
import { useProductDiscovery } from "../hooks/use-product-discovery";

export function HomePage({
  api,
  apiBaseUrl,
}: {
  readonly api: StorefrontCatalogApi;
  readonly apiBaseUrl: string;
}) {
  const [parameters, setParameters] = useSearchParams();
  const normalized = new URLSearchParams(parameters);
  if (!normalized.has("pageSize")) normalized.set("pageSize", "12");
  const discovery = useProductDiscovery(api, normalized);
  const landing =
    [...normalized.keys()].every((key) => key === "page" || key === "pageSize") &&
    (normalized.get("page") ?? "1") === "1";
  const products = discovery.page?.items ?? [];
  return (
    <main id="main-content">
      {!discovery.loading && landing && products[0] !== undefined && (
        <>
          <StorefrontHero product={products[0]} apiBaseUrl={apiBaseUrl} />
          <CategoryShowcase
            categories={discovery.categories}
            products={products}
            apiBaseUrl={apiBaseUrl}
          />
        </>
      )}
      <section id="catalog" className="catalog-page" aria-labelledby="catalog-title">
        <div className="page-heading catalog-heading">
          <div>
            <span className="eyebrow">NovaCommerce</span>
            <h1 id="catalog-title">Sản phẩm công nghệ</h1>
          </div>
          <p>{discovery.page?.totalItems ?? 0} sản phẩm</p>
        </div>
        <div className="catalog-browser">
          <CatalogFilters
            categories={discovery.categories}
            parameters={normalized}
            onSubmit={setParameters}
          />
          <div className="catalog-results">
            {discovery.loading ? (
              <p role="status" className="state-panel">
                Đang tải cửa hàng...
              </p>
            ) : discovery.error ? (
              <div role="alert" className="state-panel">
                <p>{discovery.error}</p>
                <button
                  className="button secondary"
                  onClick={() => void discovery.retry()}
                >
                  Thử lại
                </button>
              </div>
            ) : products.length === 0 ? (
              <p className="state-panel">Không tìm thấy sản phẩm phù hợp.</p>
            ) : (
              <>
                <ProductGrid products={products} apiBaseUrl={apiBaseUrl} />
                <Pagination
                  page={discovery.page!.page}
                  totalPages={discovery.page!.totalPages}
                  parameters={normalized}
                  onChange={setParameters}
                />
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Pagination({
  page,
  totalPages,
  parameters,
  onChange,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly parameters: URLSearchParams;
  readonly onChange: (value: URLSearchParams) => void;
}) {
  const go = (nextPage: number) => {
    const next = new URLSearchParams(parameters);
    next.set("page", String(nextPage));
    onChange(next);
  };
  return (
    <nav className="pagination" aria-label="Phân trang">
      <button
        className="icon-button"
        aria-label="Trang trước"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        ←
      </button>
      <span>
        Trang {page} / {Math.max(totalPages, 1)}
      </span>
      <button
        className="icon-button"
        aria-label="Trang sau"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
      >
        →
      </button>
    </nav>
  );
}
