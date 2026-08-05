// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useSearchParams } from "react-router-dom";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { CatalogFilters } from "../components/catalog-filters";
import { ProductGrid } from "../components/product-grid";
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
  return (
    <main id="main-content" className="catalog-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">NovaCommerce</span>
          <h1>Sản phẩm công nghệ</h1>
        </div>
        <p>{discovery.page?.totalItems ?? 0} sản phẩm</p>
      </div>
      <CatalogFilters
        categories={discovery.categories}
        parameters={normalized}
        onSubmit={setParameters}
      />
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
      ) : discovery.page?.items.length === 0 ? (
        <p className="state-panel">Không tìm thấy sản phẩm phù hợp.</p>
      ) : (
        <>
          <ProductGrid
            products={discovery.page?.items ?? []}
            apiBaseUrl={apiBaseUrl}
          />
          <Pagination
            page={discovery.page!.page}
            totalPages={discovery.page!.totalPages}
            parameters={normalized}
            onChange={setParameters}
          />
        </>
      )}
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
