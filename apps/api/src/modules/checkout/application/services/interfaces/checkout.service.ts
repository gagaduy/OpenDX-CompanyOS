// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CheckoutCreationDto, CheckoutCustomerContext, CheckoutDto, CreateCheckoutRequest } from "../../dtos/checkout.dto";
export interface CheckoutServiceContract {
  create(request: CreateCheckoutRequest, context: CheckoutCustomerContext): Promise<CheckoutCreationDto>;
  get(checkoutId: string, context: CheckoutCustomerContext): Promise<CheckoutDto>;
  initiatePayment(checkoutId: string, context: CheckoutCustomerContext): Promise<CheckoutCreationDto>;
}
