// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import { useCart } from "../../cart/hooks/cart-context";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { ProductGallery } from "../components/product-gallery";
import { VariantSelector } from "../components/variant-selector";
import { useProductDetail } from "../hooks/use-product-detail";

export function ProductDetailPage({
  api,
  apiBaseUrl,
}: {
  readonly api: StorefrontCatalogApi;
  readonly apiBaseUrl: string;
}) {
  const { productSlug = "" } = useParams();
  const detail = useProductDetail(api, productSlug);
  const { add, loading: cartLoading, error: cartError } = useCart();
  const [selectedId, setSelectedId] = useState("");
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (detail.product !== undefined && selectedId === "")
      setSelectedId(detail.product.variants[0]?.id ?? "");
  }, [detail.product, selectedId]);
  if (detail.loading)
    return (
      <main id="main-content" className="content-page">
        <p role="status" className="state-panel">
          Đang tải sản phẩm...
        </p>
      </main>
    );
  if (detail.error || detail.product === undefined)
    return (
      <main id="main-content" className="content-page">
        <p role="alert" className="state-panel">
          {detail.error ?? "Không tìm thấy sản phẩm."}
        </p>
      </main>
    );
  const product = detail.product;
  const selected =
    product.variants.find((variant) => variant.id === selectedId) ??
    product.variants[0]!;
  const submit = async () => {
    setAdded(false);
    try {
      await add(selected.id);
      setAdded(true);
    } catch {
      setAdded(false);
    }
  };
  return (
    <main id="main-content" className="content-page product-detail">
      <ProductGallery
        src={new URL(product.primaryMedia.contentUrl, apiBaseUrl).toString()}
        alt={product.primaryMedia.altText}
      />
      <section className="product-detail-info">
        <span className="eyebrow">{product.categoryName}</span>
        <h1>{product.name}</h1>
        <p className="product-description">{product.description}</p>
        <p className="detail-price">{formatVnd(selected.price.amountMinor)}</p>
        <p className="sku">SKU {selected.sku}</p>
        <VariantSelector
          variants={product.variants}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />
        <p className="stock">
          {selected.purchasable
            ? `Còn ${selected.availableQuantity} sản phẩm`
            : "Tạm hết hàng"}
        </p>
        <button
          className="button primary buy-button"
          disabled={!selected.purchasable || cartLoading}
          onClick={() => void submit()}
        >
          {cartLoading ? "Đang cập nhật..." : "Thêm vào giỏ"}
        </button>
        {added && (
          <p role="status" className="success-message">
            Đã thêm vào giỏ hàng.
          </p>
        )}
        {cartError && (
          <p role="alert" className="line-warning">
            {cartError}
          </p>
        )}
      </section>
    </main>
  );
}
