// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { PaymentGatewayError } from "../../application/providers/payment-gateway";
import { ApplicationError } from "../../../../shared/http/application-error";
export function mapSePayPayloadError(error: unknown): never {
  if (error instanceof PaymentGatewayError && error.category === "invalid_response") throw new ApplicationError(400, "INVALID_SEPAY_NOTIFICATION", "SePay notification payload is invalid");
  throw error;
}
