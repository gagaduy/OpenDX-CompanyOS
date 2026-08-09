// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PaymentApi } from "../api/payment-api";
import {
  clearPendingCheckout,
  pendingCheckoutId,
} from "../components/payment-submit-form";
import { usePaymentStatus } from "../hooks/use-payment-status";

export function PaymentReturnPage({ api }: { readonly api: PaymentApi }) {
  const [parameters] = useSearchParams();
  const checkoutId = pendingCheckoutId();
  const status = usePaymentStatus(api, checkoutId);
  const navigationOutcome = parameters.get("outcome");
  const paid = status.checkout?.status === "completed";
  const terminalFailure =
    status.checkout?.status === "expired" ||
    status.checkout?.status === "canceled";

  useEffect(() => {
    if (paid || terminalFailure) clearPendingCheckout();
  }, [paid, terminalFailure]);

  return (
    <main id="main-content" className="payment-result-page">
      <div className="payment-result-content">
        {paid ? (
          <CheckCircle2 className="result-icon success" />
        ) : terminalFailure ? (
          <XCircle className="result-icon danger" />
        ) : (
          <Clock3 className="result-icon" />
        )}
        <span className="eyebrow">Trạng thái đơn hàng</span>
        <h1>
          {paid
            ? "Thanh toán đã xác nhận"
            : terminalFailure
              ? "Checkout đã kết thúc"
              : "Đang xác minh thanh toán"}
        </h1>
        <p>
          {paid
            ? "Đơn hàng của bạn đã được thanh toán thành công."
            : terminalFailure
              ? "Đơn hàng chưa được thanh toán trong thời gian giữ hàng."
              : "Thanh toán đang được xác minh. Trạng thái sẽ tự cập nhật."}
        </p>
        {status.polling && (
          <p role="status" className="result-status">
            Đang đồng bộ với SePay...
          </p>
        )}
        {status.error && (
          <p role="alert" className="inline-alert">
            {status.error}
          </p>
        )}
        {checkoutId === undefined && (
          <p className="inline-alert">
            Không tìm thấy checkout đang chờ trên thiết bị này.
          </p>
        )}
        {navigationOutcome && !paid && !terminalFailure && (
          <small>Đang hoàn tất yêu cầu thanh toán.</small>
        )}
        <div className="result-actions">
          <Link className="button primary" to="/orders">
            Xem đơn hàng
          </Link>
          <Link className="button secondary" to="/">
            Tiếp tục mua sắm
          </Link>
        </div>
      </div>
    </main>
  );
}
