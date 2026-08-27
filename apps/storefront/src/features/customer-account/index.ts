// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export { CustomerAccountApi } from "./api/customer-account-api";
export { AccountWorkspace } from "./components/account-workspace";
export { useCustomerAccount } from "./hooks/use-customer-account";
export { AccountPage } from "./pages/account-page";
export { AddressPage } from "./pages/address-page";
export type {
  CustomerAddress,
  CustomerProfile,
} from "./types/customer-account.types";
