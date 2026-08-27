// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, createBrowserRouter } from "react-router-dom";
import {
  CategoryPage,
  HomePage,
  IntroHomePage,
  ProductDetailPage,
  SearchPage,
  type StorefrontCatalogApi,
} from "../features/catalog";
import { StorefrontShell } from "./storefront-shell";
import { CartPage, CartProvider, useCart, type CartApi } from "../features/cart";
import type { CustomerSessionApi } from "../features/authentication/api/customer-session-api";
import {
  CustomerSessionProvider,
  useCustomerSession,
} from "../features/authentication/hooks/customer-session-context";
import { SignInPage } from "../features/authentication/pages/sign-in-page";
import { CheckoutGate } from "../features/authentication/components/checkout-gate";
import type { CustomerAccountApi } from "../features/customer-account/api/customer-account-api";
import { AccountPage } from "../features/customer-account/pages/account-page";
import { AddressPage } from "../features/customer-account/pages/address-page";
import type { CheckoutApi } from "../features/checkout/api/checkout-api";
import { CheckoutPage } from "../features/checkout/pages/checkout-page";
import type { PaymentApi } from "../features/payment/api/payment-api";
import { PaymentReturnPage } from "../features/payment/pages/payment-return-page";
import type { OrderApi } from "../features/order/api/order-api";
import { OrderListPage } from "../features/order/pages/order-list-page";
import { OrderDetailPage } from "../features/order/pages/order-detail-page";
import {
  WishlistProvider,
  useWishlist,
  type WishlistApi,
} from "../features/wishlist";

export function createAppRouter(dependencies: {
  readonly catalogApi: StorefrontCatalogApi;
  readonly cartApi: CartApi;
  readonly sessionApi: CustomerSessionApi;
  readonly accountApi: CustomerAccountApi;
  readonly checkoutApi: CheckoutApi;
  readonly paymentApi: PaymentApi;
  readonly orderApi: OrderApi;
  readonly wishlistApi: WishlistApi;
  readonly apiBaseUrl: string;
  readonly googleClientId?: string;
}) {
  return createBrowserRouter([
    {
      element: (
        <CustomerSessionProvider api={dependencies.sessionApi}>
          <WishlistProvider api={dependencies.wishlistApi}>
            <StorefrontSessionBoundary cartApi={dependencies.cartApi} />
          </WishlistProvider>
        </CustomerSessionProvider>
      ),
      children: [
        {
          path: "/",
          element: (
            <IntroHomePage
              api={dependencies.catalogApi}
              apiBaseUrl={dependencies.apiBaseUrl}
            />
          ),
        },
        {
          path: "/products",
          element: (
            <HomePage
              api={dependencies.catalogApi}
              apiBaseUrl={dependencies.apiBaseUrl}
            />
          ),
        },
        { path: "/categories/:categorySlug", element: <CategoryPage /> },
        { path: "/search", element: <SearchPage /> },
        {
          path: "/products/:productSlug",
          element: (
            <ProductDetailPage
              api={dependencies.catalogApi}
              apiBaseUrl={dependencies.apiBaseUrl}
            />
          ),
        },
        {
          path: "/cart",
          element: <CartPage apiBaseUrl={dependencies.apiBaseUrl} />,
        },
        {
          path: "/sign-in",
          element: <SignInPage googleClientId={dependencies.googleClientId} />,
        },
        {
          path: "/account",
          element: (
            <CheckoutGate>
              <AccountPage api={dependencies.accountApi} />
            </CheckoutGate>
          ),
        },
        {
          path: "/account/addresses",
          element: (
            <CheckoutGate>
              <AddressPage api={dependencies.accountApi} />
            </CheckoutGate>
          ),
        },
        {
          path: "/checkout",
          element: (
            <CheckoutGate>
              <CheckoutPage
                api={dependencies.checkoutApi}
                accountApi={dependencies.accountApi}
              />
            </CheckoutGate>
          ),
        },
        {
          path: "/payment/return",
          element: (
            <CheckoutGate>
              <PaymentReturnPage api={dependencies.paymentApi} />
            </CheckoutGate>
          ),
        },
        {
          path: "/orders",
          element: (
            <CheckoutGate>
              <OrderListPage api={dependencies.orderApi} />
            </CheckoutGate>
          ),
        },
        {
          path: "/orders/:orderId",
          element: (
            <CheckoutGate>
              <OrderDetailPage api={dependencies.orderApi} />
            </CheckoutGate>
          ),
        },
        { path: "*", element: <Navigate replace to="/" /> },
      ],
    },
  ]);
}

function StorefrontSessionBoundary({ cartApi }: { readonly cartApi: CartApi }) {
  const { loading } = useCustomerSession();
  if (loading) {
    return (
      <StorefrontShell cartCount={0}>
        <main id="main-content">
          <p role="status" className="state-panel">
            Đang tải cửa hàng...
          </p>
        </main>
      </StorefrontShell>
    );
  }
  return (
    <CartProvider api={cartApi}>
      <ShellWithCart />
    </CartProvider>
  );
}

function ShellWithCart() {
  const { cart } = useCart();
  const { totalItems } = useWishlist();
  const { session } = useCustomerSession();
  return (
    <StorefrontShell
      cartCount={cart.itemCount}
      wishlistCount={totalItems}
      authenticated={session.kind === "customer"}
    />
  );
}
