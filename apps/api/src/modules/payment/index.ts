// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createPaymentHealthReader,
  createPaymentModule,
  type PaymentHealthDependencies,
  type PaymentModuleDependencies,
  type PaymentNotificationModuleDependencies,
} from "./payment.module";
export type { PaymentCheckoutPort, CreatePendingPaymentRequest, InitiatePaymentRequest } from "./application/services/interfaces/payment-checkout-port";
export type { PaymentExpiryPort, PaymentExpiryResult } from "./application/services/interfaces/payment-expiry-port";
export type { InitiatedPaymentDto, PendingPaymentDto } from "./application/dtos/payment.dto";
export type { PaymentGateway, PaymentInitiation } from "./application/providers/payment-gateway";
export type { PaymentMethod } from "./domain/entities/payment-attempt";
export { PaymentGatewayError } from "./application/providers/payment-gateway";
export { SePayPaymentGateway, type SePayGatewayConfiguration } from "./infrastructure/providers/sepay/sepay-payment-gateway";
export { UnavailablePaymentGateway } from "./infrastructure/providers/unavailable-payment-gateway";
export type {
  PaymentAgeBucket,
  PaymentDiscrepancyResult,
  PaymentHealthReader,
  PaymentHealthWindow,
  PendingPaymentHealth,
  ProviderEvidenceHealth,
  ProviderStatusClass,
} from "./application/services/interfaces/payment-health-reader";
