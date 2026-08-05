// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ErrorRequestHandler } from "express";
import { ApplicationError } from "../../../../shared/http/application-error";
import { CartApplicationError } from "../../application/services/cart-application.error";

const statusByCode: Readonly<Record<string, number>> = {
  CART_NOT_FOUND: 404,
  CART_OWNERSHIP_DENIED: 403,
  CART_RESOLUTION_REQUIRED: 409,
  CART_RESOLUTION_CONFLICT: 409,
  CART_CONFLICT: 409,
  PRODUCT_NOT_AVAILABLE: 409,
  PRICE_CHANGED: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_CART_QUANTITY: 400,
};

export const cartErrorMiddleware: ErrorRequestHandler = (error, _req, _res, next) => {
  if (error instanceof CartApplicationError) {
    next(new ApplicationError(statusByCode[error.code] ?? 400, error.code, error.message));
    return;
  }
  next(error);
};
