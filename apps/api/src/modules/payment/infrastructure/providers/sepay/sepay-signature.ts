// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHmac } from "node:crypto";
import type { PaymentMethod } from "../../../domain/entities/payment-attempt";

export interface SePayField { readonly name: string; readonly value: string; }
export interface BuildSePayFieldsInput {
  readonly amountVnd: number;
  readonly merchantId: string;
  readonly description: string;
  readonly invoiceNumber: string;
  readonly customerId?: string;
  readonly paymentMethod?: PaymentMethod;
  readonly successUrl: string;
  readonly errorUrl: string;
  readonly cancelUrl: string;
}
export function buildSePayCheckoutFields(input: BuildSePayFieldsInput): readonly SePayField[] {
  if (!Number.isSafeInteger(input.amountVnd) || input.amountVnd <= 0) throw new Error("SePay amount is invalid");
  const fields: SePayField[] = [
    { name: "order_amount", value: String(input.amountVnd) },
    { name: "merchant", value: required(input.merchantId, "merchant") },
    { name: "currency", value: "VND" },
    { name: "operation", value: "PURCHASE" },
    { name: "order_description", value: required(input.description, "description") },
    { name: "order_invoice_number", value: required(input.invoiceNumber, "invoice") },
  ];
  if (input.customerId !== undefined) fields.push({ name: "customer_id", value: required(input.customerId, "customer") });
  if (input.paymentMethod !== undefined) fields.push({ name: "payment_method", value: input.paymentMethod });
  fields.push(
    { name: "success_url", value: required(input.successUrl, "success URL") },
    { name: "error_url", value: required(input.errorUrl, "error URL") },
    { name: "cancel_url", value: required(input.cancelUrl, "cancel URL") },
  );
  return fields;
}
export function signSePayFields(fields: readonly SePayField[], secretKey: string): string {
  const secret = required(secretKey, "secret");
  const signed = fields.map(({ name, value }) => `${name}=${value}`).join(",");
  return createHmac("sha256", secret).update(signed, "utf8").digest("base64");
}
function required(value: string, label: string): string { const result = value.trim(); if (result.length === 0) throw new Error(`SePay ${label} is required`); return result; }
