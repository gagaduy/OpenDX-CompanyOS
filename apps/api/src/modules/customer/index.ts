// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createCustomerModule,
  type CustomerModuleDependencies,
} from "./customer.module";
export type {
  CustomerPrincipal,
  GuestPrincipal,
} from "./application/dtos/customer.dto";
export type { CustomerSessionServiceContract } from "./application/services/interfaces/customer-session.service";
export type { CustomerCartLoginResolver } from "./application/services/interfaces/customer-cart-login-resolver";
export type { CheckoutCustomerReader, CheckoutCustomerSnapshot } from "./application/services/interfaces/checkout-customer-reader";
export {
  clearCookie,
  readCookie,
  setSessionCookie,
  type StorefrontCookieConfig,
} from "./presentation/middleware/storefront-cookies";
export {
  requireCsrf,
  requireStorefrontOrigin,
} from "./presentation/middleware/storefront-mutation.middleware";
