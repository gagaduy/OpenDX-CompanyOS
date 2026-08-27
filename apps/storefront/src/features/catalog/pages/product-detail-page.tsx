// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import { useCart } from "../../cart";
import { WishlistButton } from "../../wishlist";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { ProductGallery } from "../components/product-gallery";
import { ServiceAssurancePanel } from "../components/service-assurance-panel";
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
  const [quantity, setQuantity] = useState(1);
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
      await add(selected.id, quantity);
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
        {product.brand === undefined ? null : (
          <p className="product-brand">{product.brand}</p>
        )}
        <p className="product-description">{product.description}</p>
        <div className="detail-price-row">
          <p className="detail-price">{formatVnd(selected.price.amountMinor)}</p>
          {selected.price.previousAmountMinor === undefined ? null : (
            <del>{formatVnd(selected.price.previousAmountMinor)}</del>
          )}
          {selected.price.discountPercentage === undefined ? null : (
            <span className="discount-badge">-{selected.price.discountPercentage}%</span>
          )}
        </div>
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
        <div className="purchase-quantity">
          <span>Số lượng</span>
          <div className="stepper">
            <button
              type="button"
              aria-label="Giảm số lượng"
              disabled={quantity <= 1}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            >
              <Minus />
            </button>
            <output aria-label="Số lượng đã chọn">{quantity}</output>
            <button
              type="button"
              aria-label="Tăng số lượng"
              disabled={quantity >= selected.availableQuantity}
              onClick={() =>
                setQuantity((current) =>
                  Math.min(selected.availableQuantity, current + 1),
                )
              }
            >
              <Plus />
            </button>
          </div>
        </div>
        <div className="product-detail-actions">
          <button
            className="button primary buy-button"
            disabled={!selected.purchasable || cartLoading}
            onClick={() => void submit()}
          >
            <ShoppingCart aria-hidden="true" />
            {cartLoading ? "Đang cập nhật..." : "Thêm vào giỏ"}
          </button>
          <WishlistButton productId={product.id} productName={product.name} />
        </div>
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
      <div className="product-detail-assurances">
        <ServiceAssurancePanel />
      </div>
    </main>
  );
}
