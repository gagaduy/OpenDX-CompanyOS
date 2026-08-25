// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Filter, Laptop, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CatalogFilters } from "./catalog-filters";
import type { StorefrontCategory } from "../types/catalog.types";

export function DiscoverySidebar({
  categories,
  parameters,
  onSubmit,
}: {
  readonly categories: readonly StorefrontCategory[];
  readonly parameters: URLSearchParams;
  readonly onSubmit: (next: URLSearchParams) => void;
}) {
  const [open, setOpen] = useState(false);
  const pageSize = parameters.get("pageSize") ?? "12";

  return (
    <aside
      className={open ? "discovery-sidebar open" : "discovery-sidebar"}
      data-state={open ? "open" : "closed"}
      aria-label="Danh mục và bộ lọc sản phẩm"
    >
      <button
        className="sidebar-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="discovery-sidebar-panel"
        aria-label={open ? "Đóng bộ lọc sản phẩm" : "Mở bộ lọc sản phẩm"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <X aria-hidden="true" />
        ) : (
          <SlidersHorizontal aria-hidden="true" />
        )}
      </button>
      <div className="sidebar-icon-rail">
        <Link to="/products#categories" aria-label="Xem danh mục sản phẩm">
          <Filter aria-hidden="true" />
        </Link>
        <Link to="/products#catalog" aria-label="Xem danh sách sản phẩm">
          <Laptop aria-hidden="true" />
        </Link>
      </div>
      <div
        id="discovery-sidebar-panel"
        className="sidebar-panel"
        data-testid="discovery-sidebar-panel"
        aria-hidden={open ? "false" : "true"}
      >
        <div className="sidebar-section">
          <span className="eyebrow">Danh mục</span>
          <div className="sidebar-category-list">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/products?category=${encodeURIComponent(category.slug)}&pageSize=${encodeURIComponent(pageSize)}#catalog`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="sidebar-section">
          <span className="eyebrow">Bộ lọc</span>
          <CatalogFilters
            categories={categories}
            parameters={parameters}
            onSubmit={(next) => {
              setOpen(false);
              onSubmit(next);
            }}
          />
        </div>
      </div>
    </aside>
  );
}
