// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { RouterProvider } from "react-router-dom";
import { CustomerSessionApi } from "../features/authentication";
import { CartApi } from "../features/cart";
import { StorefrontCatalogApi } from "../features/catalog";
import { WishlistApi } from "../features/wishlist";
import { CustomerAccountApi } from "../features/customer-account";
import { CheckoutApi } from "../features/checkout/api/checkout-api";
import { OrderApi } from "../features/order/api/order-api";
import { PaymentApi } from "../features/payment/api/payment-api";
import { ApiClient } from "../shared/http/api-client";
import { createAppRouter } from "./app-router";
import type { StorefrontEnvironment } from "./environment";
import { ThemeProvider } from "./theme-provider";

export function App({
  environment,
}: {
  readonly environment: StorefrontEnvironment;
}) {
  const client = new ApiClient(environment.apiBaseUrl);
  const router = createAppRouter({
    catalogApi: new StorefrontCatalogApi(client),
    cartApi: new CartApi(client),
    sessionApi: new CustomerSessionApi(client),
    accountApi: new CustomerAccountApi(client),
    checkoutApi: new CheckoutApi(client),
    paymentApi: new PaymentApi(client),
    orderApi: new OrderApi(client),
    wishlistApi: new WishlistApi(client),
    apiBaseUrl: environment.apiBaseUrl,
    ...(environment.googleClientId === undefined
      ? {}
      : { googleClientId: environment.googleClientId }),
  });
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
