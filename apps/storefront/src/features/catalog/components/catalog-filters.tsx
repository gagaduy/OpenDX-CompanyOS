// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { FormEvent } from "react";
import type { StorefrontCategory } from "../types/catalog.types";

export function CatalogFilters({
  categories,
  parameters,
  onSubmit,
}: {
  readonly categories: readonly StorefrontCategory[];
  readonly parameters: URLSearchParams;
  readonly onSubmit: (next: URLSearchParams) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of [
      "query",
      "category",
      "minPriceVnd",
      "maxPriceVnd",
      "stockStatus",
      "discountStatus",
      "sort",
      "pageSize",
    ]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    next.set("page", "1");
    onSubmit(next);
  }
  return (
    <form
      className="catalog-filters"
      onSubmit={submit}
      aria-label="Bộ lọc sản phẩm"
    >
      <label>
        Tìm kiếm
        <input
          name="query"
          type="search"
          defaultValue={parameters.get("query") ?? ""}
          placeholder="Tên, thương hiệu, SKU"
        />
      </label>
      <label>
        Danh mục
        <select name="category" defaultValue={parameters.get("category") ?? ""}>
          <option value="">Tất cả</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Giá từ
        <input
          name="minPriceVnd"
          type="number"
          min="0"
          step="1000"
          defaultValue={parameters.get("minPriceVnd") ?? ""}
        />
      </label>
      <label>
        Giá đến
        <input
          name="maxPriceVnd"
          type="number"
          min="0"
          step="1000"
          defaultValue={parameters.get("maxPriceVnd") ?? ""}
        />
      </label>
      <label>
        Tồn kho
        <select
          name="stockStatus"
          defaultValue={parameters.get("stockStatus") ?? ""}
        >
          <option value="">Tất cả</option>
          <option value="in_stock">Còn hàng</option>
          <option value="out_of_stock">Hết hàng</option>
        </select>
      </label>
      <label>
        Ưu đãi
        <select
          name="discountStatus"
          defaultValue={parameters.get("discountStatus") ?? ""}
        >
          <option value="">Tất cả</option>
          <option value="on_sale">Đang giảm</option>
        </select>
      </label>
      <label>
        Sắp xếp
        <select name="sort" defaultValue={parameters.get("sort") ?? "newest"}>
          <option value="newest">Mới cập nhật</option>
          <option value="best_selling">Bán chạy</option>
          <option value="price_asc">Giá tăng dần</option>
          <option value="price_desc">Giá giảm dần</option>
          <option value="name_asc">Tên A-Z</option>
        </select>
      </label>
      <input
        type="hidden"
        name="pageSize"
        value={parameters.get("pageSize") ?? "12"}
      />
      <button type="submit" className="button primary">
        Áp dụng
      </button>
    </form>
  );
}
