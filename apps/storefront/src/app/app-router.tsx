// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, createBrowserRouter } from "react-router-dom";
import {
  CategoryPage,
  HomePage,
  IntroHomePage,
  ProductDetailPage,
  SearchPage,
  StorefrontContentProvider,
  type StorefrontCatalogApi,
  useNavigationCategories,
} from "../features/catalog";
import { StorefrontShell } from "./storefront-shell";
import { CartPage, CartProvider, useCart, type CartApi } from "../features/cart";
import {
  CheckoutGate,
  CustomerSessionProvider,
  SignInPage,
  useCustomerSession,
  type CustomerSessionApi,
} from "../features/authentication";
import {
  AccountPage,
  AddressPage,
  type CustomerAccountApi,
} from "../features/customer-account";
import { CheckoutPage, type CheckoutApi } from "../features/checkout";
import { PaymentReturnPage, type PaymentApi } from "../features/payment";
import {
  OrderDetailPage,
  OrderListPage,
  type OrderApi,
} from "../features/order";
import {
  WishlistProvider,
  WishlistPage,
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
          <StorefrontContentProvider api={dependencies.catalogApi}>
            <StorefrontSessionBoundary
              cartApi={dependencies.cartApi}
              catalogApi={dependencies.catalogApi}
              wishlistApi={dependencies.wishlistApi}
            />
          </StorefrontContentProvider>
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
          element: (
            <SignInPage
              initialOpen={true}
              googleClientId={dependencies.googleClientId}
              catalogApi={dependencies.catalogApi}
              apiBaseUrl={dependencies.apiBaseUrl}
            />
          ),
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
          path: "/account/wishlist",
          element: (
            <CheckoutGate>
              <WishlistPage
                accountApi={dependencies.accountApi}
                apiBaseUrl={dependencies.apiBaseUrl}
              />
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

function StorefrontSessionBoundary({
  cartApi,
  catalogApi,
  wishlistApi,
}: {
  readonly cartApi: CartApi;
  readonly catalogApi: StorefrontCatalogApi;
  readonly wishlistApi: WishlistApi;
}) {
  const { session, loading } = useCustomerSession();
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

  const sessionKey = session.kind === "customer"
    ? `customer:${session.customerId}`
    : session.kind === "guest"
      ? `guest:${session.expiresAt}`
      : "anonymous";

  return (
    <WishlistProvider key={`wishlist:${sessionKey}`} api={wishlistApi}>
      <CartProvider key={`cart:${sessionKey}`} api={cartApi}>
        <ShellWithCart catalogApi={catalogApi} />
      </CartProvider>
    </WishlistProvider>
  );
}

function ShellWithCart({
  catalogApi,
}: {
  readonly catalogApi: StorefrontCatalogApi;
}) {
  const { cart } = useCart();
  const { totalItems } = useWishlist();
  const { session } = useCustomerSession();
  const navigation = useNavigationCategories(catalogApi);
  return (
    <StorefrontShell
      cartCount={cart.itemCount}
      wishlistCount={totalItems}
      authenticated={session.kind === "customer"}
      customerEmail={session.kind === "customer" ? session.email : undefined}
      categories={navigation.categories}
    />
  );
}
