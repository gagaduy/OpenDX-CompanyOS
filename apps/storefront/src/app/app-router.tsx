// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, createBrowserRouter } from "react-router-dom";
import type { StorefrontCatalogApi } from "../features/catalog/api/storefront-catalog-api";
import { CategoryPage } from "../features/catalog/pages/category-page";
import { HomePage } from "../features/catalog/pages/home-page";
import { IntroHomePage } from "../features/catalog/pages/intro-home-page";
import { SearchPage } from "../features/catalog/pages/search-page";
import { StorefrontShell } from "./storefront-shell";
import type { CartApi } from "../features/cart/api/cart-api";
import { CartProvider, useCart } from "../features/cart/hooks/cart-context";
import { CartPage } from "../features/cart/pages/cart-page";
import { ProductDetailPage } from "../features/catalog/pages/product-detail-page";
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

export function createAppRouter(dependencies: {
  readonly catalogApi: StorefrontCatalogApi;
  readonly cartApi: CartApi;
  readonly sessionApi: CustomerSessionApi;
  readonly accountApi: CustomerAccountApi;
  readonly checkoutApi: CheckoutApi;
  readonly paymentApi: PaymentApi;
  readonly orderApi: OrderApi;
  readonly apiBaseUrl: string;
  readonly googleClientId?: string;
}) {
  return createBrowserRouter([
    {
      element: (
        <CustomerSessionProvider api={dependencies.sessionApi}>
          <StorefrontSessionBoundary cartApi={dependencies.cartApi} />
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
  return <StorefrontShell cartCount={cart.itemCount} />;
}
