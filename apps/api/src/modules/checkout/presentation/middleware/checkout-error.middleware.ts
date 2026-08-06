// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CheckoutApplicationError } from "../../application/services/checkout-application.error";

export const checkoutErrorMiddleware: ErrorRequestHandler = (error: unknown, _req, _res, next) => {
  if (error instanceof CheckoutApplicationError) {
    const status = error.code === "CHECKOUT_NOT_FOUND" ? 404 : error.code === "PAYMENT_PROVIDER_NOT_CONFIGURED" ? 503 : 409;
    next(new ApplicationError(status, error.code, error.message)); return;
  }
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  const known: Readonly<Record<string, number>> = {
    ADDRESS_NOT_FOUND: 404, CUSTOMER_NOT_ACTIVE: 403, CART_NOT_FOUND: 409,
    CART_RESOLUTION_CONFLICT: 409, PRODUCT_NOT_AVAILABLE: 409, INSUFFICIENT_STOCK: 409,
    INVENTORY_ITEM_NOT_FOUND: 409, PROMOTION_NOT_FOUND: 422, NOT_FOUND: 422,
    PROMOTION_NOT_ACTIVE: 422, PROMOTION_NOT_ELIGIBLE: 422, IDEMPOTENCY_CONFLICT: 409,
  };
  if (code !== undefined && known[code] !== undefined) { next(new ApplicationError(known[code], code, error instanceof Error ? error.message : "Checkout failed")); return; }
  next(error);
};
