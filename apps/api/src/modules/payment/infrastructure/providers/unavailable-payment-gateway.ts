// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { PaymentGatewayError, type CreateProviderCheckoutRequest, type NormalizedPaymentNotification, type PaymentGateway, type PaymentInitiation, type ProviderOrderDetail } from "../../application/providers/payment-gateway";
export class UnavailablePaymentGateway implements PaymentGateway {
  createCheckout(_request: CreateProviderCheckoutRequest): Promise<PaymentInitiation> { return Promise.reject(unavailable()); }
  getOrderDetail(_providerOrderId: string): Promise<ProviderOrderDetail> { return Promise.reject(unavailable()); }
  normalizeNotification(_payload: unknown): NormalizedPaymentNotification { throw unavailable(); }
}
function unavailable(): PaymentGatewayError { return new PaymentGatewayError("not_configured", "Payment provider is not configured"); }
