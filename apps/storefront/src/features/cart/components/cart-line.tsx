// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { StorefrontCartLine } from "../types/cart.types";

export function CartLine({
  line,
  apiBaseUrl,
  disabled,
  onQuantity,
  onRemove,
}: {
  readonly line: StorefrontCartLine;
  readonly apiBaseUrl: string;
  readonly disabled: boolean;
  readonly onQuantity: (quantity: number) => void;
  readonly onRemove: () => void;
}) {
  return (
    <article className="cart-line">
      {line.primaryMediaUrl === undefined ? (
        <div className="cart-line-image unavailable" />
      ) : (
        <img
          className="cart-line-image"
          src={new URL(line.primaryMediaUrl, apiBaseUrl).toString()}
          alt={line.primaryMediaAltText}
        />
      )}
      <div className="cart-line-info">
        <h2>
          {line.productSlug ? (
            <Link to={`/products/${line.productSlug}`}>{line.productName}</Link>
          ) : (
            line.productName
          )}
        </h2>
        <p>
          {line.variantTitle}
          {line.sku ? ` · ${line.sku}` : ""}
        </p>
        {line.change === "price_changed" && (
          <p className="line-warning">Giá đã được cập nhật</p>
        )}
        {line.change === "unavailable" && (
          <p className="line-warning">
            Số lượng hoặc sản phẩm không còn khả dụng
          </p>
        )}
      </div>
      <label className="quantity-control">
        Số lượng
        <input
          aria-label={`Số lượng ${line.productName}`}
          type="number"
          min="1"
          max="999"
          value={line.quantity}
          disabled={disabled}
          onChange={(event) => onQuantity(Number(event.target.value))}
        />
      </label>
      <div className="line-total">
        <strong>{formatVnd(line.subtotalVnd)}</strong>
        <span>{formatVnd(line.unitPriceVnd)} / sản phẩm</span>
      </div>
      <button
        className="icon-button"
        aria-label={`Xóa ${line.productName}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 />
      </button>
    </article>
  );
}
