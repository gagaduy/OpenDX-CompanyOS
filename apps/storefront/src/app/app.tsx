// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { RouterProvider } from "react-router-dom";
import { CustomerSessionApi } from "../features/authentication/api/customer-session-api";
import { CartApi } from "../features/cart/api/cart-api";
import { StorefrontCatalogApi } from "../features/catalog/api/storefront-catalog-api";
import { CustomerAccountApi } from "../features/customer-account/api/customer-account-api";
import { ApiClient } from "../shared/http/api-client";
import { createAppRouter } from "./app-router";
import type { StorefrontEnvironment } from "./environment";

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
    apiBaseUrl: environment.apiBaseUrl,
    ...(environment.googleClientId === undefined
      ? {}
      : { googleClientId: environment.googleClientId }),
  });
  return <RouterProvider router={router} />;
}
