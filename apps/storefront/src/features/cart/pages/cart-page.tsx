// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatVnd } from "../../../shared/format/currency";
import { CartLine } from "../components/cart-line";
import { useCart } from "../hooks/cart-context";
import { useCustomerSession } from "../../authentication/hooks/customer-session-context";
import { CartResolutionDialog } from "../components/cart-resolution-dialog";
import { useEffect } from "react";

export function CartPage({ apiBaseUrl }: { readonly apiBaseUrl: string }) {
  const {
    cart,
    loading,
    error,
    refresh,
    update,
    remove,
    checkoutReadiness,
    resolve,
    resolution,
    inspectResolution,
  } = useCart();
  const { session } = useCustomerSession();
  const navigate = useNavigate();
  const [parameters, setParameters] = useSearchParams();
  useEffect(() => {
    if (parameters.get("resolution") === "required") void inspectResolution();
  }, [parameters, inspectResolution]);
  const resolveCart = async (action: "keep_guest" | "keep_saved" | "merge") => {
    try {
      await resolve(action);
      const next = new URLSearchParams(parameters);
      next.delete("resolution");
      setParameters(next, { replace: true });
    } catch {
      /* Context renders the stable error. */
    }
  };
  const checkout = async () => {
    if (session.kind !== "customer") {
      navigate("/sign-in?returnTo=%2Fcart");
      return;
    }
    try {
      await checkoutReadiness();
      navigate("/checkout");
    } catch {
      /* Context renders the stable error. */
    }
  };
  return (
    <main id="main-content" className="content-page">
      {parameters.get("resolution") === "required" && (
        <CartResolutionDialog
          busy={loading}
          guestCart={resolution?.guestCart}
          savedCart={resolution?.savedCart}
          onResolve={(action) => void resolveCart(action)}
        />
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">Đơn hàng của bạn</span>
          <h1>Giỏ hàng</h1>
        </div>
        <p>{cart.itemCount} sản phẩm</p>
      </div>
      {error && (
        <div role="alert" className="inline-alert">
          {error}
          <button className="button secondary" onClick={() => void refresh()}>
            Thử lại
          </button>
        </div>
      )}
      {loading && cart.items.length === 0 ? (
        <p role="status" className="state-panel">
          Đang tải giỏ hàng...
        </p>
      ) : cart.items.length === 0 ? (
        <div className="state-panel">
          <p>Giỏ hàng đang trống.</p>
          <Link className="button primary" to="/products">
            Xem sản phẩm
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <section className="cart-lines" aria-label="Sản phẩm trong giỏ">
            {cart.items.map((line) => (
              <CartLine
                key={line.id}
                line={line}
                apiBaseUrl={apiBaseUrl}
                disabled={loading}
                onQuantity={(quantity) => void update(line.id, quantity)}
                onRemove={() => void remove(line.id)}
              />
            ))}
          </section>
          <aside className="cart-summary">
            <h2>Tạm tính</h2>
            <div>
              <span>{cart.itemCount} sản phẩm</span>
              <strong>{formatVnd(cart.totalVnd)}</strong>
            </div>
            {cart.requiresAction && (
              <p className="line-warning">
                Vui lòng xử lý các thay đổi trước khi tiếp tục.
              </p>
            )}
            <button
              className="button primary full-width"
              disabled={loading || cart.requiresAction}
              onClick={() => void checkout()}
            >
              Tiếp tục thanh toán
            </button>
            <p>Chưa tạo đơn hàng hoặc thanh toán ở bước này.</p>
          </aside>
        </div>
      )}
    </main>
  );
}
