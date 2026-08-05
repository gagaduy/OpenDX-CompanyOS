// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { RouterProvider } from "react-router-dom";
import { StorefrontCatalogApi } from "../features/catalog/api/storefront-catalog-api";
import { ApiClient } from "../shared/http/api-client";
import { CartApi } from "../features/cart/api/cart-api";
import { CustomerSessionApi } from "../features/authentication/api/customer-session-api";
import { CustomerAccountApi } from "../features/customer-account/api/customer-account-api";
import { createAppRouter } from "./app-router";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const client = new ApiClient(apiBaseUrl);
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const router = createAppRouter({ catalogApi: new StorefrontCatalogApi(client), cartApi: new CartApi(client), sessionApi: new CustomerSessionApi(client), accountApi: new CustomerAccountApi(client), apiBaseUrl, ...(googleClientId === undefined ? {} : { googleClientId }) });
export function App() { return <RouterProvider router={router} />; }
