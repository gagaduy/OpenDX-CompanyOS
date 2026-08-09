// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Check, MapPin, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import type { CustomerAccountApi } from "../../customer-account/api/customer-account-api";
import { useCustomerAccount } from "../../customer-account/hooks/use-customer-account";
import type { CheckoutApi } from "../api/checkout-api";
import { PaymentSubmitForm } from "../../payment/components/payment-submit-form";
import { checkoutErrorMessage } from "../mappers/checkout-error.mapper";
import type { CheckoutCreation } from "../types/checkout.types";

export function CheckoutPage({
  api,
  accountApi,
}: {
  readonly api: CheckoutApi;
  readonly accountApi: CustomerAccountApi;
}) {
  const account = useCustomerAccount(accountApi);
  const [addressId, setAddressId] = useState<string>();
  const [promotionCode, setPromotionCode] = useState("");
  const [checkout, setCheckout] = useState<CheckoutCreation>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const idempotencyKey = useRef(crypto.randomUUID());
  const selectedAddress = addressId ?? account.addresses.find(({ isDefault }) => isDefault)?.id;

  const createCheckout = async () => {
    if (selectedAddress === undefined) {
      setError("Hãy chọn hoặc thêm địa chỉ trước khi tạo đơn hàng.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      setCheckout(
        await api.create(
          {
            addressId: selectedAddress,
            ...(promotionCode.trim() === ""
              ? {}
              : { promotionCode: promotionCode.trim() }),
          },
          idempotencyKey.current,
        ),
      );
    } catch (caughtError) {
      setError(checkoutErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  if (account.loading && account.profile === undefined) {
    return <main id="main-content" className="content-page"><p role="status" className="state-panel">Đang chuẩn bị thanh toán...</p></main>;
  }

  return (
    <main id="main-content" className="content-page checkout-page">
      <div className="page-heading">
        <div><span className="eyebrow">Thanh toán bảo mật</span><h1>Hoàn tất đơn hàng</h1></div>
        <p><ShieldCheck aria-hidden="true" /> Thanh toán an toàn</p>
      </div>
      {error && <p className="inline-alert" role="alert">{error}</p>}
      <div className="checkout-layout">
        <section className="checkout-main" aria-label="Thông tin checkout">
          <div className="checkout-section">
            <header><span>01</span><div><h2>Địa chỉ nhận hàng</h2><p>Chọn địa chỉ đã xác minh trong tài khoản.</p></div></header>
            {account.addresses.length === 0 ? (
              <div className="state-panel compact"><p>Chưa có địa chỉ nhận hàng.</p><Link className="button secondary" to="/account/addresses">Thêm địa chỉ</Link></div>
            ) : (
              <div className="address-choice-list">
                {account.addresses.map((address) => {
                  const selected = selectedAddress === address.id;
                  return (
                    <label className={selected ? "address-choice selected" : "address-choice"} key={address.id}>
                      <input type="radio" name="address" value={address.id} checked={selected} onChange={() => setAddressId(address.id)} disabled={checkout !== undefined} />
                      <MapPin aria-hidden="true" />
                      <span><strong>{address.recipientName}</strong><small>{address.phoneNumber}</small><span>{address.addressLine}, {address.ward}, {address.provinceOrCity}</span></span>
                      {selected && <Check aria-hidden="true" />}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="checkout-section">
            <header><span>02</span><div><h2>Mã ưu đãi</h2><p>Áp dụng ưu đãi cho đơn hàng này.</p></div></header>
            <input aria-label="Mã ưu đãi" placeholder="Nhập mã ưu đãi" value={promotionCode} disabled={checkout !== undefined} onChange={(event) => setPromotionCode(event.target.value.toUpperCase())} />
          </div>
          {checkout && (
            <div className="checkout-section checkout-review">
              <header><span>03</span><div><h2>Xác nhận sản phẩm</h2><p>Giá và tồn kho được giữ đến {new Date(checkout.expiresAt).toLocaleTimeString("vi-VN")}.</p></div></header>
              {checkout.lines.map((line) => <div className="review-line" key={line.sku}><div><strong>{line.productTitle}</strong><span>{line.variantLabel} · {line.sku}</span></div><span>{line.quantity} × {formatVnd(line.unitPriceVnd)}</span></div>)}
            </div>
          )}
        </section>
        <aside className="checkout-summary">
          <span className="eyebrow">Tóm tắt</span>
          <h2>{checkout ? "Đơn hàng của bạn" : "Kiểm tra lần cuối"}</h2>
          {checkout ? (
            <>
              <dl><div><dt>Tạm tính</dt><dd>{formatVnd(checkout.subtotalVnd)}</dd></div><div><dt>Ưu đãi</dt><dd>-{formatVnd(checkout.discountVnd)}</dd></div><div className="checkout-total"><dt>Tổng cộng</dt><dd>{formatVnd(checkout.totalVnd)}</dd></div></dl>
              <PaymentSubmitForm checkoutId={checkout.id} payment={checkout.payment} />
              <p>Bạn sẽ được chuyển đến cổng thanh toán bảo mật.</p>
            </>
          ) : (
            <><p>Kiểm tra địa chỉ và ưu đãi trước khi tiếp tục.</p><button className="button primary full-width" disabled={submitting || account.addresses.length === 0} onClick={() => void createCheckout()}>{submitting ? "Đang kiểm tra..." : "Tiếp tục thanh toán"}</button></>
          )}
        </aside>
      </div>
    </main>
  );
}
