// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { StorefrontApiError } from "../../../shared/http/api-client";

const checkoutErrorMessages: Readonly<Record<string, string>> = {
  CART_CONFLICT: "Giỏ hàng đã thay đổi. Hãy kiểm tra lại giỏ hàng rồi thử lại.",
  CART_NOT_FOUND: "Giỏ hàng hiện không còn sản phẩm để thanh toán.",
  CART_RESOLUTION_CONFLICT:
    "Giỏ hàng cần được xử lý trước khi tiếp tục thanh toán.",
  PRODUCT_CHANGED:
    "Thông tin sản phẩm đã thay đổi. Hãy kiểm tra lại giỏ hàng rồi thử lại.",
  PRODUCT_NOT_AVAILABLE:
    "Một sản phẩm trong giỏ hiện không còn được bán.",
  INSUFFICIENT_STOCK:
    "Số lượng sản phẩm trong kho không còn đủ. Hãy cập nhật giỏ hàng.",
  INVENTORY_ITEM_NOT_FOUND:
    "Một sản phẩm trong giỏ hiện không có sẵn trong kho.",
  PROMOTION_NOT_FOUND: "Mã ưu đãi không tồn tại.",
  NOT_FOUND: "Mã ưu đãi không tồn tại.",
  PROMOTION_NOT_ACTIVE: "Mã ưu đãi hiện không thể sử dụng.",
  PROMOTION_NOT_ELIGIBLE: "Đơn hàng này chưa đủ điều kiện nhận ưu đãi.",
  PAYMENT_PROVIDER_NOT_CONFIGURED:
    "Thanh toán qua SePay đang tạm thời chưa sẵn sàng.",
};

export function checkoutErrorMessage(error: unknown): string {
  if (error instanceof StorefrontApiError) {
    return (
      checkoutErrorMessages[error.errorCode] ??
      "Không thể chuẩn bị thanh toán lúc này. Vui lòng thử lại."
    );
  }
  return "Không thể chuẩn bị thanh toán lúc này. Vui lòng thử lại.";
}
