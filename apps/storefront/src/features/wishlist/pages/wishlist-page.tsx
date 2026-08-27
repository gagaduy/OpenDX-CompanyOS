// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { useCustomerSession } from "../../authentication";
import { ProductGrid } from "../../catalog";
import {
  AccountWorkspace,
  useCustomerAccount,
  type CustomerAccountApi,
} from "../../customer-account";
import { useWishlist } from "../hooks/wishlist-context";

export function WishlistPage({
  accountApi,
  apiBaseUrl,
}: {
  readonly accountApi: CustomerAccountApi;
  readonly apiBaseUrl: string;
}) {
  const account = useCustomerAccount(accountApi);
  const wishlist = useWishlist();
  const { logout } = useCustomerSession();

  if (account.profile === undefined && account.loading) {
    return (
      <main id="main-content" className="content-page">
        <p role="status" className="state-panel">Đang tải danh sách yêu thích...</p>
      </main>
    );
  }
  if (account.profile === undefined) {
    return (
      <main id="main-content" className="content-page">
        <p role="alert" className="state-panel">{account.error ?? "Không thể tải tài khoản."}</p>
      </main>
    );
  }

  return (
    <AccountWorkspace
      profile={account.profile}
      active="wishlist"
      onLogout={() => void logout()}
    >
      <section className="account-section wishlist-page" aria-labelledby="wishlist-heading">
        <header className="account-section-heading wishlist-heading">
          <div>
            <span className="eyebrow">Bộ sưu tập của bạn</span>
            <h2 id="wishlist-heading">Sản phẩm yêu thích</h2>
          </div>
          <strong>{wishlist.totalItems} sản phẩm</strong>
        </header>

        {wishlist.loading ? (
          <p role="status" className="state-panel">Đang tải danh sách yêu thích...</p>
        ) : wishlist.error !== undefined && wishlist.errorProductId === undefined ? (
          <div role="alert" className="state-panel">
            <p>{wishlist.error}</p>
            <button className="button secondary" type="button" onClick={() => void wishlist.refresh(wishlist.page)}>
              Thử lại
            </button>
          </div>
        ) : wishlist.products.length === 0 ? (
          <div className="wishlist-empty state-panel">
            <Heart aria-hidden="true" />
            <h3>Chưa có sản phẩm yêu thích</h3>
            <p>Lưu những sản phẩm bạn muốn xem lại tại đây.</p>
            <Link className="button primary" to="/products">Khám phá sản phẩm</Link>
          </div>
        ) : (
          <>
            <ProductGrid products={wishlist.products} apiBaseUrl={apiBaseUrl} />
            <nav className="pagination" aria-label="Phân trang yêu thích">
              <button
                className="icon-button"
                type="button"
                aria-label="Trang trước"
                disabled={wishlist.page <= 1}
                onClick={() => void wishlist.refresh(wishlist.page - 1)}
              >
                ←
              </button>
              <span>Trang {wishlist.page} / {Math.max(wishlist.totalPages, 1)}</span>
              <button
                className="icon-button"
                type="button"
                aria-label="Trang sau"
                disabled={wishlist.page >= wishlist.totalPages}
                onClick={() => void wishlist.refresh(wishlist.page + 1)}
              >
                →
              </button>
            </nav>
          </>
        )}
      </section>
    </AccountWorkspace>
  );
}
